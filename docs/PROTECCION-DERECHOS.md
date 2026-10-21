# Protección de derechos de KoRForge

Qué tienes hoy, qué haces el día que alguien copia la app y qué plantillas enviar. La licencia
está en `LICENSE` y la norma de publicación en `docs/REGLAS-VERSIONES.md`.

## 1. Qué protege qué

| Herramienta | Protege | Dónde está |
|---|---|---|
| Derecho de autor | El código y la app. Nace solo al crearla, no hay que registrar nada | Repo, releases, hashes |
| `LICENSE` | Los términos de uso: sin copias, sin derivados, sin reventa | Raíz del repo |
| SHA-256 de cada binario | Que ese `.exe` es el tuyo y existía tal día | Release de GitHub, `SHA256SUMS.txt`, web |
| Commits firmados | Fecha criptográfica de cada cambio y tu autoría | `docs/FIRMA-COMMITS.md` |
| Marca registrada | El nombre KoRForge | Pendiente: OEPM |

## 2. Evidencia que ya se genera sola

Cada release deja, sin hacer nada especial:

1. **Binarios con tus datos dentro.** Los `.exe` llevan `CompanyName: KoRZoR` y
   `LegalCopyright: Copyright (c) 2026 KoRZoR. Todos los derechos reservados.` en sus propiedades
   de archivo. Si alguien redistribuye tu build, el archivo mismo dice de quién es.
2. **SHA-256 publicado con fecha.** El hash de cada binario va en el cuerpo de la release de
   GitHub, en el asset `SHA256SUMS.txt` y en el registro de la web (`sha256` de cada descarga).
3. **Historial de commits y tags** con fecha, en `korzor/KoRForge`.

Cómo comprobar un binario descargado (Windows):

```powershell
Get-FileHash .\KoRForge-Setup-1.2.0.exe -Algorithm SHA256
```

Tiene que coincidir con el del release. Si no coincide, no es el oficial, no lo ejecutes.

Cómo comprobar la cadena de commits:

```bash
git log --show-signature -5        # si los commits están firmados, sale la firma verificada
git tag -v v1.2.0                  # firma del tag, si está firmado
```

## 3. Checklist de evidencia (una carpeta por release)

Guarda fuera del PC (nube propia o disco cifrado) y en local:

- [ ] `SHA256SUMS.txt` de la release
- [ ] Copia del cuerpo del release de GitHub (captura o PDF con la fecha visible)
- [ ] Captura de la página `github.com/korzor/KoRForge/releases` con fecha
- [ ] Captura de la ficha de la web con fecha
- [ ] `git log --show-signature` de ese tag
- [ ] Si hubo registro o sello de tiempo, el título o certificado

Con eso tienes "existía, con este contenido, en esta fecha, y era mío".

## 4. Qué haces si encuentras una copia

El orden importa. Primero se congela la prueba, luego se reclama.

1. **Congela la evidencia.** Captura de la web con la URL y la fecha visibles, descarga el archivo
   que distribuya, calcula su SHA-256 y anota quién lo publica (dominio, correo, usuario).
2. **Compara.** Mismo hash (copia literal), tu código con otra interfaz, o solo el nombre y tus
   textos. Cada caso tiene una vía distinta.
3. **Takedown en la plataforma.** Aquí se gana rápido y gratis:
   - GitHub: [formulario DMCA](https://github.com/contact/dmca)
   - Microsoft Store, itch.io, Google Play, Steam: su formulario de copyright
   - Hosting español: aviso al prestador de servicios (LSSI)
   - Cloudflare: abuso de contenido si el sitio está detrás
4. **Requerimiento de cese** al que copia (plantilla de abajo), por burofax o correo certificado.
   Deja constancia de la fecha y del acuse.
5. **Comisión de Propiedad Intelectual (Sección Segunda)** si está en una web: vía administrativa
   gratuita para retirada o bloqueo.
6. **Vía judicial** si hay dinero en juego: cesación, indemnización y publicación de la sentencia.
   Aquí ya hace falta abogado y procurador.
7. **Vía penal** (art. 270 del Código Penal) solo si hay ánimo de lucro y escala grave, normalmente
   venta del software.

Lo que no funciona: denunciar en comisaría sin más. La vía normal es civil.

## 5. Plantilla de DMCA para GitHub (inglés, lista para copiar)

```
To: GitHub, Inc. (copyright@github.com)

Subject: DMCA takedown notice - unauthorized copy of KoRForge

1. Identification of the copyrighted work:
I am the copyright owner of the software "KoRForge", distributed at
https://github.com/korzor/KoRForge and released as Windows binaries. Copyright rests with
KoRZoR. The work is licensed for end use only, with no permission to copy, modify,
redistribute or sell (see LICENSE).

2. Identification of the infringing material:
The following repository / material is an unauthorized copy or derivative:
URL: <URL del repositorio o del archivo>
Description: <qué copia: código, binarios, nombre, textos>

3. Evidence of ownership:
- Original repository: https://github.com/korzor/KoRForge
- Release with SHA-256 hashes: <URL del release>
- SHA-256 of the official binary: <hash>
- SHA-256 of the suspect binary: <hash, si aplica>

4. Good faith statement:
I have a good faith belief that the use of the material in the manner complained of is not
authorized by the copyright owner, its agent, or the law.

5. Accuracy and authority statement:
I swear, under penalty of perjury, that the information in this notification is accurate and
that I am the copyright owner, or am authorized to act on behalf of the owner, of an exclusive
right that is allegedly infringed.

6. Contact:
Name: KoRZoR
Email: <tu correo de contacto>
Country: Spain

Signature: /s/ KoRZoR
Date: <dd-mm-aa>
```

## 6. Plantilla de requerimiento de cese (español, burofax o correo certificado)

```
REQUERIMIENTO DE CESE Y RESERVA DE ACCIONES
Ley de Propiedad Intelectual, artículos 138, 139 y 141

De: KoRZoR, titular de los derechos de explotación del programa de ordenador "KoRForge"
A: <nombre o razón social, NIF y domicilio del destinatario>
Fecha: <dd-mm-aa>

1. Soy titular de los derechos de explotación del programa de ordenador KoRForge, cuya licencia
de uso restringe expresamente la copia, la modificación, la creación de obras derivadas, la
redistribución y la explotación comercial. La documentación está disponible en
https://github.com/korzor/KoRForge.

2. He tenido conocimiento de que usted <describe: distribuye / vende / publica / aloja> una copia
o una obra derivada del software en <URL>, sin mi consentimiento por escrito. Se adjuntan
capturas fechadas y huellas SHA-256 de los archivos afectados.

3. Por medio del presente le requiero para que:
   a) CESE de forma inmediata en la reproducción, distribución, comunicación pública y
      cualquier otra forma de explotación del software, retirando los archivos y la oferta.
   b) ME FACILITE la información que obre en su poder sobre el origen y el alcance de la
      actividad infractora (art. 138.2 LPI).
   c) Se ABSTENGA de reanudarla en el futuro.

4. Le concedo un plazo de 48 horas para comunicarme por escrito que ha cesado y que acepta lo
anterior. Transcurrido ese plazo sin respuesta satisfactoria, acudiré a la jurisdicción civil
para el ejercicio de las acciones de cesación, indemnización y publicación de la sentencia, así
como a las medidas cautelares que procedan, con reclamación de las costas.

Firmado: KoRZoR
Contacto: <correo>
```

Guarda copia del envío y del acuse: si luego vas al juzgado, ese requerimiento es una prueba de
que le diste la oportunidad de cesar y de que siguió.

## 7. Pendiente (para hacer con calma)

- [ ] Firmar los commits y tags (procedimiento en `docs/FIRMA-COMMITS.md`)
- [ ] Sello de tiempo del código (Safe Creative, Bitmark o similar)
- [ ] Registro de la Propiedad Intelectual como programa de ordenador
- [ ] Marca KoRForge en OEPM (clases 9 y 42) y, más adelante, EUIPO
- [ ] Marca de agua por compilación para identificar de qué descarga sale una copia
- [ ] Repositorio en privado cuando el proyecto facture: el código deja de ser descargable
