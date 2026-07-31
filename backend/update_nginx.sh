#!/bin/bash
python3 -c "
with open('/etc/nginx/sites-available/bjptn', 'r') as f:
    content = f.read()
content = content.replace('no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0', 'public, max-age=31536000, immutable')
if '*.cloudinary.com' not in content:
    content = content.replace('*.backblazeb2.com;', '*.backblazeb2.com *.cloudinary.com res.cloudinary.com;')
with open('/etc/nginx/sites-available/bjptn', 'w') as f:
    f.write(content)
"
nginx -t && systemctl reload nginx && echo NGINX_SUCCESS
