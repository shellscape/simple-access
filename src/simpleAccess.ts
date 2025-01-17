import * as _ from 'lodash';
import Ajv from 'ajv';

import { BaseAdapter } from './adapters';
import { Utils } from './core';
import { Action, Condition, ErrorEx, Permission, PermissionOptions, Tuple, Role } from './types';
import { roleSchema } from './validation';

const ALL = '*';

export class SimpleAccess {
  constructor(private readonly _adapter: BaseAdapter) {
    if (this._adapter == null) {
      throw new ErrorEx(ErrorEx.VALIDATION_ERROR, 'Adapter must be provided to retrieve roles');
    }
  }

  /**
   * Validate role object schema
   * @param {Role} role Role object
   * @returns {void}
   * @protected
   */
  protected validateRole(role: Role): void {
    const validator: Ajv = new Ajv();
    const isValid = validator.validate(roleSchema, role);

    if (!isValid) {
      const roleContent = role && role.name ? `, Role name: "${role.name}"\n` : '';
      throw new ErrorEx(ErrorEx.VALIDATION_ERROR, `Invalid role object schema${roleContent}`);
    }
  }

  /**
   * Build hash table from one or more roles, merging resources and actions
   * @param {Array<Role>} roles Roles array
   * @returns {{[p: string]: Tuple}} Object with merged resources, including internal data like attributes, conditions
   * @private
   */
  private getResources(roles: Array<Role>): { [k: string]: any } {
    const resources: { [k: string]: any } = {};
    if (roles == null || roles.length === 0) {
      return resources;
    }

    roles.forEach((role) => {
      role.resources.forEach((resource) => {
        let cachedResource = resources[resource.name];

        // If resource does not exist, add to object
        if (cachedResource == null) cachedResource = resources[resource.name] = {};

        // If resource has wildcard action then skip merging actions
        if (cachedResource._ === ALL) return;

        if (
          resource.actions.length === 1 &&
          _.isString(resource.actions[0]) &&
          resource.actions[0] === ALL
        ) {
          resources[resource.name] = ALL;
          return;
        }

        (resource.actions as Action[]).forEach((action) => {
          const currentAction: Action = {
            name: action.name,
            attributes: action.attributes ? Array.from(action.attributes) : [],
            conditions: action.conditions ? Array.from(action.conditions as any) : [],
            scope: action.scope ? Object.assign(action.scope) : {}
          };

          // If we have all actions allowed no need to proceed
          if (resources[resource.name] === ALL) return;

          const cachedAction: Action = resources[resource.name][currentAction.name];

          if (cachedAction == null) {
            resources[resource.name][currentAction.name] = currentAction;
          } else {
            // Check and merge attributes
            const currentActionAllowAllEx =
              currentAction.attributes?.length === 1 && currentAction.attributes[0] === ALL;
            const cachedActionAllowAllEx =
              cachedAction.attributes?.length === 1 && cachedAction.attributes[0] === ALL;

            if (!cachedActionAllowAllEx) {
              if (currentActionAllowAllEx) {
                // If action or cached actions = ['*'] then, no need to merge
                // We take the most permissive attributes
                cachedAction.attributes = [ALL];
              } else {
                const attributesBuffer = [];
                const currentActionAllowAll = currentAction.attributes?.[0] === ALL;
                const cachedActionAllowAll = cachedAction.attributes?.[0] === ALL;

                if (!currentActionAllowAll && !cachedActionAllowAll) {
                  const projected = _.filter(
                    _.union(currentAction.attributes, cachedAction.attributes),
                    (a) => a != null && !a.startsWith('!')
                  );

                  attributesBuffer.push(...projected);
                } else if (currentActionAllowAll && cachedActionAllowAll) {
                  const negated = _.filter(
                    _.intersection(currentAction.attributes, cachedAction.attributes),
                    (a) => a != null && a.startsWith('!')
                  );

                  attributesBuffer.push(ALL, ...negated);
                } else if (currentActionAllowAll || cachedActionAllowAll) {
                  const negated = _.filter(
                    _.union(currentAction.attributes, cachedAction.attributes),
                    (a) => a != null && a.startsWith('!')
                  );

                  attributesBuffer.push(ALL, ...negated);
                }

                cachedAction.attributes = attributesBuffer;
              }
            }

            // Check conditions
            if (currentAction.conditions == null) {
              currentAction.conditions = [];
            }

            const isEmptyConditions = currentAction.conditions.length === 0;
            const isEmptyCachedConditions = cachedAction.conditions?.length === 0;

            if (isEmptyConditions) {
              if (!isEmptyCachedConditions) {
                cachedAction.conditions = [];
              }
            } else if (!isEmptyCachedConditions) {
              (cachedAction.conditions as Condition[] | undefined)?.push(
                ...(currentAction.conditions as any)
              );
            }

            // Check scope
            if (currentAction.scope == null) {
              currentAction.scope = {};
            }

            const isScopeEmpty = Object.entries(currentAction.scope).length === 0;
            const isCachedScopeEmpty = Object.entries(cachedAction.scope!).length === 0;
            if (isScopeEmpty) {
              if (!isCachedScopeEmpty) {
                cachedAction.scope = {};
              }
            } else if (!isCachedScopeEmpty) {
              Object.entries(currentAction.scope).forEach(([k, v]) => {
                cachedAction.scope![k] = v;
              });
            }
          }
        });
      });
    });

    return resources;
  }

  get adapter(): BaseAdapter {
    return this._adapter;
  }

  /**
   * Check the ability of accessing a resource through one or more roles (assigned to subject)
   * and the ability of executing specific action on this resource
   * @param {Array<string> | string} role One or more roles
   * @param {Array<string> | string} action Action name (Like "create")
   * @param {string} resource Resource name (Like "order")
   * @returns {Promise<Permission>}
   */
  async can(role: Array<string> | string, action: string, resource: string): Promise<Permission> {
    const roleNames = Array.isArray(role) ? role : [role];
    const pInfo: PermissionOptions = {
      granted: false,
      access: { roles: roleNames, action, resource },
      grants: {},
      attributes: [],
      conditions: [],
      scope: {}
    };

    roleNames.forEach((r) => {
      if (r == null) {
        throw new ErrorEx(ErrorEx.VALIDATION_ERROR, `One or more roles are not valid`);
      }
    });

    // Get roles by their names
    const roles = await this._adapter.getRolesByName(roleNames);
    // Validate that all roles are available in roles list
    if (roles == null) {
      throw new ErrorEx(ErrorEx.VALIDATION_ERROR, `Invalid roles array, returned by adapter`);
    }

    if (roles.length !== roleNames.length) {
      const diff = _.difference(
        roleNames,
        roles.map((r) => r.name)
      );
      throw new ErrorEx(ErrorEx.VALIDATION_ERROR, `Role(s) [${diff.toString()}] does not exist`);
    }

    // Validate roles schema
    for (let i = 0; i < roles.length; i += 1) {
      this.validateRole(roles[i]);
    }

    // Merge roles resource, actions, attributes, conditions and scope (if possible)
    const resources = this.getResources(roles);
    pInfo.grants = resources;

    // Validate resource & ability, then update permission
    if (resources[resource] != null) {
      if (resources[resource] === ALL) {
        // If subject has access to all actions within the resource
        pInfo.attributes = [ALL];
        pInfo.conditions = [];
        pInfo.scope = {};
        pInfo.granted = true;
      } else if (resources[resource][action] != null) {
        // If subject has access specific actions within the resource
        const { attributes, conditions, scope } = resources[resource][action];
        pInfo.attributes = attributes || [];
        pInfo.conditions = conditions || [];
        pInfo.scope = scope || {};
        pInfo.granted = true;
      }
    }

    return new Permission(pInfo);
  }

  /**
   * Check if permission allows subject (like user) to access resource,
   * role conditions will be evaluated for this check
   * @param permission Permission object
   * @param {Tuple} subject User object
   * @param {Tuple} resource Resource object
   * @returns {Promise<boolean>}
   */
  canSubjectAccessResource(permission: Permission, subject: Tuple, resource: Tuple): boolean {
    return Utils.canSubjectAccessResource(permission, subject, resource);
  }

  /**
   * Filter data based on fields within current permission
   * @param permission
   * @param {Tuple} data
   * @returns {any}
   */
  filter(permission: Permission, data: Tuple) {
    return Utils.filter(permission, data);
  }
}
