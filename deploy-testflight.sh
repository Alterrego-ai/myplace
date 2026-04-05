#!/bin/bash
#
# ╔═══════════════════════════════════════════════════════╗
# ║   DEPLOY TESTFLIGHT - Sauf Imprévu                    ║
# ║   Script tout-en-un : sync + archive + ouverture      ║
# ╚═══════════════════════════════════════════════════════╝
#
# USAGE :
#   ./deploy-testflight.sh
#
# Si le fichier n'est pas exécutable, lance d'abord :
#   chmod +x deploy-testflight.sh
#

set -e  # stop au premier échec

# ── Couleurs pour lisibilité
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # no color

# ── Chemin du script (fonctionne même lancé depuis ailleurs)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   DEPLOY TESTFLIGHT - Sauf Imprévu                    ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""

# ── 1. Sync Capacitor (web → iOS)
echo -e "${YELLOW}[1/4]${NC} Synchronisation du contenu web vers iOS..."
npx cap sync ios
echo -e "${GREEN}✓${NC} Sync OK"
echo ""

# ── 2. Bump du build number
echo -e "${YELLOW}[2/4]${NC} Incrément du numéro de build..."
cd ios/App
agvtool next-version -all
NEW_BUILD=$(agvtool what-version -terse)
echo -e "${GREEN}✓${NC} Build bumpé à : ${NEW_BUILD}"
echo ""

# ── 3. Archive
echo -e "${YELLOW}[3/4]${NC} Création de l'archive (2-5 min, patience)..."
rm -rf ./build
xcodebuild -project App.xcodeproj \
  -scheme App \
  -configuration Release \
  -archivePath ./build/App.xcarchive \
  -destination "generic/platform=iOS" \
  archive -quiet
echo -e "${GREEN}✓${NC} Archive créée"
echo ""

# ── 4. Ouverture dans Xcode Organizer
echo -e "${YELLOW}[4/4]${NC} Ouverture dans Xcode pour upload..."
open ./build/App.xcarchive
echo -e "${GREEN}✓${NC} Xcode ouvert"
echo ""

echo -e "${GREEN}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                  ✓ PRÊT À UPLOADER                    ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Dans la fenêtre Xcode qui vient de s'ouvrir :"
echo ""
echo -e "  ${BLUE}1.${NC} Clique sur le bouton bleu  ${YELLOW}Distribute App${NC}  (à droite)"
echo -e "  ${BLUE}2.${NC} Choisis  ${YELLOW}App Store Connect${NC}  →  ${YELLOW}Upload${NC}"
echo -e "  ${BLUE}3.${NC} Clique  ${YELLOW}Next${NC}  à chaque étape"
echo -e "  ${BLUE}4.${NC} À la fin, clique  ${YELLOW}Upload${NC}"
echo -e "  ${BLUE}5.${NC} Attends la coche verte ${GREEN}✓${NC} (~2 min)"
echo ""
echo -e "Build ${YELLOW}${NEW_BUILD}${NC} sera visible sur TestFlight dans 5-15 min."
echo ""
