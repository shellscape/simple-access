// https://stackoverflow.com/questions/41139763/how-to-declare-a-fixed-length-array-in-typescript
type ArrayLengthMutationKeys = 'splice' | 'push' | 'pop' | 'shift' | 'unshift' | number;
type ArrayItems<T extends any[]> = T extends Array<infer TItems> ? TItems : never;
type FixedLengthArray<T extends any[]> = Pick<T, Exclude<keyof T, ArrayLengthMutationKeys>> & {
  [Symbol.iterator]: () => IterableIterator<ArrayItems<T>>;
};

export interface Tuple {
  [key: string]: any;
}

export class ErrorEx extends Error {
  static VALIDATION_ERROR: 'VALIDATION_ERROR';

  constructor(name: string, message: string) {
    super(message);
    this.name = name;
  }
}

export interface Role {
  name: string;
  resources: Resource[];
}

export interface Resource {
  name: string;
  actions: FixedLengthArray<['*']> | Action[];
}

export type Condition = Record<string, any>;

export interface Action {
  name: string;
  attributes?: string[];
  conditions?: FixedLengthArray<['*']> | Record<string, Condition>[];
  scope?: {
    [k: string]: Tuple;
  };
}
