import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EnvConfig } from './env.config';

type NestedKeyOf<ObjectType extends object> = {
  [Key in keyof ObjectType & (string | number)]: ObjectType[Key] extends object
    ? `${Key}.${NestedKeyOf<ObjectType[Key]>}` | `${Key}`
    : `${Key}`;
}[keyof ObjectType & (string | number)];

type NestedValue<ObjectType, Path extends string> = Path extends `${infer Key}.${infer Rest}`
  ? Key extends keyof ObjectType
    ? ObjectType[Key] extends object
      ? NestedValue<ObjectType[Key], Rest>
      : never
    : never
  : Path extends keyof ObjectType
    ? ObjectType[Path]
    : never;

@Injectable()
export class EnvConfigService {
  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  get<Key extends NestedKeyOf<EnvConfig>>(key: Key): NestedValue<EnvConfig, Key> {
    return this.configService.get(key as keyof EnvConfig, { infer: true }) as NestedValue<EnvConfig, Key>;
  }
}
