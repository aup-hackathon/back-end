import 'reflect-metadata';

import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

export default new DataSource({
  type: 'postgres',
  url: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL,
  synchronize: false,
  migrationsRun: false,
  entities: [__dirname + '/../modules/**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  namingStrategy: new SnakeNamingStrategy(),
});
