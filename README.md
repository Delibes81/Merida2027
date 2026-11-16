# Mérida 2027

Sitio del grupo para el viaje a la boda de Clau y Diego en Yucatán (25 feb – 2 mar 2027): itinerario, datos de la boda, ruta, lugares, pendientes, costos, vuelos y gastos compartidos.

## Estructura

| Ruta | Qué es |
|---|---|
| `index.html` | La página |
| `assets/styles.css` | Estilos |
| `assets/app.js` | Portada animada, cuenta regresiva, mapa y calculadora |
| `assets/grupo.js` | Núcleo del grupo: acceso, pendientes, "me apunto", vuelos, reservas y gastos |
| `assets/avisos.js` | Muro de avisos |
| `assets/docs.js` | Documentos del viaje (archivos privados en Supabase Storage) |
| `assets/cuentas.js` | Dividir una cuenta por consumo |
| `assets/config.js` | URL y clave pública de Supabase |
| `api/ticket.js` | Función de Vercel que lee la foto de un ticket con la API de Claude |
| `supabase/schema.sql` | Tablas, permisos, almacenamiento y tiempo real |

La página no tiene paso de build. La única dependencia es la de `api/ticket.js`, que Vercel instala solo.

## Lectura de tickets (opcional)

Para que la foto de un ticket se convierta en renglones, agrega en Vercel (*Settings → Environment Variables*) la variable `ANTHROPIC_API_KEY` con una clave de la consola de Anthropic y vuelve a desplegar. Sin ella todo funciona igual, solo que los renglones se capturan a mano. La función solo responde a quien ya entró al grupo, y cada lectura tiene un costo pequeño que se cobra a esa clave.

## Conectar Supabase (una sola vez)

1. **Tablas**: en Supabase abre *SQL Editor*, pega todo `supabase/schema.sql` y dale *Run*.
2. **Código del grupo**: en el mismo editor corre, con el código que quieras:

   ```sql
   select set_trip_code('elige-un-codigo-largo');
   ```

3. **Acceso anónimo**: en *Authentication → Sign In / Providers* activa *Anonymous sign-ins*.
4. **Clave pública**: en *Project Settings → API Keys* copia la clave *publishable* (o *anon*) y pégala en `supabaseKey` dentro de `assets/config.js`.

Cuando `schema.sql` cambie, vuelve a correrlo completo: está hecho para ejecutarse varias veces sin borrar datos ni el código del grupo.

La clave pública puede vivir en el repositorio: los datos los protegen las reglas de `schema.sql`. La clave *secret* / *service_role* nunca va en este proyecto.

### Cómo funciona el acceso

Cada persona escribe el código del grupo y elige su nombre. Supabase crea una sesión anónima para ese dispositivo y la liga a esa persona; sin ese paso no se puede leer ni escribir nada. Para cambiar el código, vuelve a correr `set_trip_code`.

## Verlo en local

```bash
npx serve .
```

## Publicar

En Vercel: importar este repositorio. No requiere configuración; cada push a `main` se publica solo.
