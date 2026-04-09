import Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('local', 'test', 'dev', 'prod').required(),
  PORT: Joi.number().port().required(),
  DATABASE_URL: Joi.string().required(),
  HCM_API_BASE_URL: Joi.string().uri().required(),
  HCM_TIMEOUT_MS: Joi.number().integer().min(1).default(3000),
}).unknown(true);
