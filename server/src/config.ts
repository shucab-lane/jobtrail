function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export const config = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  port: Number(process.env.PORT ?? 4000),
  isProduction: process.env.NODE_ENV === "production",
};
