// Conexión con Supabase. La clave "publishable" (o "anon") es pública por diseño:
// lo que protege los datos son las reglas de supabase/schema.sql, no esta clave.
// Nunca pongas aquí la clave "secret" ni la "service_role".
window.TRIP_CONFIG = {
  supabaseUrl: 'https://tpjudpjeapxsaywyjclx.supabase.co',
  supabaseKey: ''
};
