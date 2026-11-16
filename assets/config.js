// Conexión con Supabase. La clave "publishable" (o "anon") es pública por diseño:
// lo que protege los datos son las reglas de supabase/schema.sql, no esta clave.
// Nunca pongas aquí la clave "secret" ni la "service_role".
window.TRIP_CONFIG = {
  supabaseUrl: 'https://tpjudpjeapxsaywyjclx.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwanVkcGplYXB4c2F5d3lqY2x4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ3OTU3OTgsImV4cCI6MjExMDM3MTc5OH0.5f4gePkwcWHhXPRt9LUm9Jlw9hlRgXZH_KvItgMmaek'
};
