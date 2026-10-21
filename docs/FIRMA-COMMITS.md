# Firmar commits y tags en Windows

Para qué sirve: un commit firmado lleva una firma criptográfica con fecha. GitHub lo muestra como
**Verified** y cualquiera puede comprobar que ese cambio lo hiciste tú y cuándo. Es prueba de
autoría fechada sin pagar nada (ver `docs/PROTECCION-DERECHOS.md`).

Hay dos caminos. **Recomendado: SSH**, porque en Windows ya tienes la clave y no hay que instalar
nada más. GPG también vale y está documentado abajo.

## Opción A: firmar con tu clave SSH (recomendado)

Requisitos: Git para Windows y una clave SSH, la misma que usas con GitHub.

```powershell
# 1. Si no tienes clave, créala (sin passphrase no, mejor con passphrase)
ssh-keygen -t ed25519 -C "korzor@korforge"

# 2. Dile a Git que firme con SSH y usa tu clave pública
git config --global gpg.format ssh
git config --global user.signingkey "$env:USERPROFILE\.ssh\id_ed25519.pub"

# 3. Firme siempre, commits y tags
git config --global commit.gpgsign true
git config --global tag.gpgsign true
```

En GitHub: **Settings > SSH and GPG keys > New SSH key**, y en **Key type** elige
**Signing Key**, pegando el contenido de `id_ed25519.pub`. Ojo: es una entrada aparte de la clave
de acceso (Authentication); hacen falta las dos, o una entrada de cada tipo con la misma clave.

Comprobar:

```powershell
git commit --allow-empty -m "prueba de firma"
git log --show-signature -1          # debe decir "Good signature"
```

En la web, el commit aparecerá con la etiqueta verde **Verified**.

## Opción B: firmar con GPG

Requisitos: [Gpg4win](https://www.gpg4win.org/) instalado.

```powershell
# 1. Generar la clave (RSA 4096 o ed25519; pon tu nombre y el correo de GitHub)
gpg --full-generate-key

# 2. Ver el ID de la clave (la cadena de 16 caracteres de la línea "sec")
gpg --list-secret-keys --keyid-format=long

# 3. Configurar Git
git config --global user.signingkey 0123456789ABCDEF
git config --global commit.gpgsign true
git config --global tag.gpgsign true

# 4. Si Git no encuentra gpg (error "gpg failed to sign the data"):
git config --global gpg.program "C:\Program Files (x86)\GnuPG\bin\gpg.exe"

# 5. Exportar la clave pública y pegarla en GitHub
#    Settings > SSH and GPG keys > New GPG key
gpg --armor --export 0123456789ABCDEF
```

Comprobar:

```powershell
# Tiene que salir "[GNUPG:] GOODSIG" y "Good signature"
git log --show-signature -1

# Firma manual de un commit o de un tag
git commit -S -m "mensaje"
git tag -s v1.2.1 -m "KoRForge 1.2.1"
```

## Qué está firmado y qué no

- **Los commits nuevos**, una vez activado lo de arriba.
- **Los commits antiguos** no se pueden firmar retroactivamente: reescribir el historial cambiaría
  los hashes y no aporta prueba real. Lo que ya tienes como prueba de esa época son las releases
  publicadas, los hashes y el historial de GitHub.
- **Los tags**: activa `tag.gpgsign` y crea los tags con `-s` o `-a`. Los tags ya publicados se
  pueden rehacer (`git tag -f -s v1.2.0 -m "..." && git push --force origin v1.2.0`), y eso sí
  deja una firma con fecha para ese tag.

## Si se pierde la clave

Una clave perdida no rompe nada hacia atrás: las firmas antiguas siguen siendo válidas, solo no
podrás firmar nuevas con ella. Lo importante: **copia de seguridad de la clave privada** (y de su
passphrase) en un sitio cifrado, y el correo de la clave debe ser el mismo que tienes en GitHub,
o la firma no se vinculará a tu cuenta.
