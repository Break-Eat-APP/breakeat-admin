#!/bin/sh
# Applique les migrations, en tolerant que la base ne soit pas encore la.
#
# Le 07/09/2026, un deploiement a echoue ainsi :
#
#   Error: P1001: Can't reach database server at postgres.railway.internal:5432
#
# Trois redemarrages rapproches plus tard, le conteneur s'arretait pour de bon
# et le service restait sur sa version precedente. Rien n'etait casse dans le
# code : Postgres a simplement mis quelques secondes de trop a repondre.
#
# On REESSAIE UNIQUEMENT sur P1001 -- l'injoignable. Une migration reellement
# fautive (SQL invalide, P3009) echoue du premier coup et le dit tout de suite :
# la reessayer dix fois ne ferait que noyer la vraie erreur sous des tentatives
# identiques, et retarder d'autant le moment ou on la lit.

ESSAIS=12
ATTENTE=5

n=1
while [ "$n" -le "$ESSAIS" ]; do
  sortie=$(pnpm exec prisma migrate deploy 2>&1)
  code=$?
  printf '%s\n' "$sortie"

  [ "$code" -eq 0 ] && exit 0

  case "$sortie" in
    *P1001*) ;;
    # Toute autre erreur est une erreur du CODE : inutile d'insister.
    *) exit "$code" ;;
  esac

  echo "Base injoignable (essai $n/$ESSAIS) — nouvelle tentative dans ${ATTENTE}s."
  n=$((n + 1))
  sleep "$ATTENTE"
done

echo "Base toujours injoignable apres $ESSAIS essais — abandon."
exit 1
