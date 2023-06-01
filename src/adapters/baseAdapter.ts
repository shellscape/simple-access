import { Role } from '../types';

export abstract class BaseAdapter {
  protected constructor(public name: string) {
    // noop
  }

  abstract getRolesByName(names: Array<string>): Promise<Array<Role>> | Array<Role>;
}
