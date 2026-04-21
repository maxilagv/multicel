# QA - Checklist de pruebas

## Licencias
- [ ] Sin licencia: modulo Usuarios bloqueado (API 403).
- [ ] Licencia valida: Usuarios habilitado y accesible.
- [ ] Licencia con max_users: no permite crear usuario extra.
- [ ] Licencia vencida: bloquea Usuarios.
- [ ] Licencia con install_id distinto: error claro.

## Red
- [ ] Politica "off": conecta desde cualquier IP.
- [ ] Politica "private": conecta solo desde LAN.
- [ ] Politica "subnet": conecta solo desde subred indicada.
- [ ] Fuera de red: login devuelve "Acceso restringido a la red local".

## Backups
- [ ] Crear backup: aparece en la lista.
- [ ] Restaurar backup: datos vuelven al estado del backup.

## Multi-PC
- [ ] Cliente conecta a servidor con IP local.
- [ ] Se pueden usar varias PCs a la vez.

## Regresion basica
- [ ] Login/Logout funcionan.
- [ ] CRUD de productos/clientes/ventas intacto.
