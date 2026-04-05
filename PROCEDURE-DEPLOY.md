# Procédure de déploiement TestFlight — Sauf Imprévu

À refaire à chaque nouvelle version.

## 1. Terminal

Ouvre le Terminal et lance :

```
cd ~/myPlace && ./deploy-testflight.sh
```

(remplace `~/myPlace` par le vrai chemin si besoin)

Attends ~5 min. Le script va :
- synchroniser le web vers iOS
- incrémenter le numéro de build
- créer l'archive
- ouvrir Xcode automatiquement

## 2. Xcode (fenêtre qui s'ouvre)

1. Clique **Distribute App** (bouton bleu à droite)
2. Choisis **App Store Connect** → **Upload**
3. Clique **Next** à chaque étape
4. À la fin, clique **Upload**
5. Attends la coche verte ✓

## 3. App Store Connect (5 à 15 min plus tard)

Va sur https://appstoreconnect.apple.com → **TestFlight**

1. Le nouveau build passe de "En cours de traitement" à "Terminé"
2. Clique sur le build
3. **Groupes de testeurs internes** → ajoute **Romaric amis**

## 4. Test

Tu reçois la notif TestFlight sur iPhone. Tu testes.

Fini.
