# YC NICE LADY — reparación local y siguiente conexión a Appwrite

## Reparación aplicada
- `preview-server.mjs` normaliza rutas con slash duplicado y `/admin`, `/admin/` y `/admin.html` sirven el panel administrativo.
- Se conserva el build estático y los archivos de tienda/admin.

## Abrir local
En Git Bash, desde esta carpeta:

```bash
npm test
npm run build
npm run preview
```

Abrir `http://localhost:4173/admin` (también se admite `//admin`).

## Pruebas locales
- `npm test`: suites de catálogo, Admin Function (simulada) y Analytics Function (simulada).
- `npm run build`: genera `dist/`.
- Preview HTTP: `/`, `/admin`, `/admin/`, `//admin`, `css/admin.css`, `js/config.js`, `js/admin.js` y el logo responden 200.

## Conexión real pendiente en Appwrite Cloud
No se inventan Function IDs ni se incluyen API keys en el frontend. Desplegar las fuentes `appwrite-functions/admin/main.js` y `appwrite-functions/analytics/main.js` como Functions en Appwrite, configurar las variables de entorno y las tablas/atributos descritos en sus README, y luego copiar los Function IDs reales a `js/config.js`:
- `appwriteAdminFunctionId`
- `appwriteAnalyticsFunctionId`

Las credenciales de servidor deben estar en variables de la Function, no en el frontend. Rotar cualquier API key que haya estado en el ZIP original y excluir `.env` de repositorios y despliegues.
