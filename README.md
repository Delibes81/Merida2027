# Mérida 2027

Sitio del grupo para el viaje a la boda de Clau y Diego en Yucatán (25 feb – 2 mar 2027): itinerario, datos de la boda, ruta, lugares, pendientes, costos, vuelos y gastos compartidos.

## Estructura

| Ruta | Qué es |
|---|---|
| `index.html` | La página |
| `assets/styles.css` | Estilos |
| `assets/app.js` | Portada animada, cuenta regresiva, mapa y calculadora |
| `assets/grupo.js` | Funciones compartidas: acceso, pendientes en vivo, "me apunto", vuelos y gastos |
| `assets/config.js` | URL y clave pública de Supabase |
| `supabase/schema.sql` | Tablas, permisos y tiempo real |

No hay dependencias que instalar ni paso de build.

## Conectar Supabase (una sola vez)

1. **Tablas**: en Supabase abre *SQL Editor*, pega todo `supabase/schema.sql` y dale *Run*.
2. **Código del grupo**: en el mismo editor corre, con el código que quieras:

   ```sql
   select set_trip_code('elige-un-codigo-largo');
   ```

3. **Acceso anónimo**: en *Authentication → Sign In / Providers* activa *Anonymous sign-ins*.
4. **Clave pública**: en *Project Settings → API Keys* copia la clave *publishable* (o *anon*) y pégala en `supabaseKey` dentro de `assets/config.js`.

La clave pública puede vivir en el repositorio: los datos los protegen las reglas de `schema.sql`. La clave *secret* / *service_role* nunca va en este proyecto.

### Cómo funciona el acceso

Cada persona escribe el código del grupo y elige su nombre. Supabase crea una sesión anónima para ese dispositivo y la liga a esa persona; sin ese paso no se puede leer ni escribir nada. Para cambiar el código, vuelve a correr `set_trip_code`.

## Verlo en local

```bash
npx serve .
```

## Publicar

En Vercel: importar este repositorio. No requiere configuración; cada push a `main` se publica solo.
