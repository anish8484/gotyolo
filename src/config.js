module.exports = {
  port: process.env.PORT || 3000,
  databaseUrl: process.env.DATABASE_URL || 'postgres://admin:password@localhost:5432/gotyolo',
};
