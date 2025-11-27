export const app = {
  port: process.env.ENVIO_API_PORT || 3000,
  isProduction: process.env.NODE_ENV === 'production',
  nodeEnv: process.env.NODE_ENV || 'development',
};
