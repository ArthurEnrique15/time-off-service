import 'dotenv/config';

export type EnvConfig = {
  port: number;
  nodeEnv: string;
  database: {
    url: string;
  };
  hcm: {
    apiBaseUrl: string;
    timeoutMs: number;
  };
};

export abstract class EnvConfigParser {
  private static get envs(): NodeJS.ProcessEnv {
    return process.env;
  }

  public static getPort(): number {
    return Number(this.envs.PORT) || 80;
  }

  public static getNodeEnv(): string {
    return this.envs.NODE_ENV || 'local';
  }

  public static getDatabaseUrl(): string {
    return this.envs.DATABASE_URL || '';
  }

  public static getHcmApiBaseUrl(): string {
    return this.envs.HCM_API_BASE_URL || '';
  }

  public static getHcmTimeoutMs(): number {
    return Number(this.envs.HCM_TIMEOUT_MS) || 3000;
  }
}

export const getEnvConfig = (): EnvConfig => ({
  port: EnvConfigParser.getPort(),
  nodeEnv: EnvConfigParser.getNodeEnv(),
  database: {
    url: EnvConfigParser.getDatabaseUrl(),
  },
  hcm: {
    apiBaseUrl: EnvConfigParser.getHcmApiBaseUrl(),
    timeoutMs: EnvConfigParser.getHcmTimeoutMs(),
  },
});
