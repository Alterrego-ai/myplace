# TODO Backend — Sauf Imprévu

## Profil utilisateur

### `PATCH /api/users/me` (à créer)
Permet au front de persister nom + téléphone du user connecté depuis le formulaire de réservation (case "Mémoriser dans mon profil").

**Auth** : Bearer token (middleware existant)

**Body JSON** :
```json
{ "name": "Romaric Riquoir", "phone": "06 12 34 56 78" }
```

**Réponse** : `{ ok: true }` ou user mis à jour.

**Implémentation suggérée dans `server.js`** :
```js
app.patch('/api/users/me', authMiddleware, async (req, res) => {
  const { name, phone } = req.body || {};
  if (phone && !/^0[1-9](?:[\s.-]?\d{2}){4}$/.test(phone.trim())) {
    return res.status(400).json({ error: 'Téléphone invalide' });
  }
  await db.run('UPDATE users SET name = ?, phone = ? WHERE id = ?',
    [name, phone, req.user.id]);
  res.json({ ok: true });
});
```

**Migration BDD** : ajouter colonne `phone TEXT` dans la table `users` si absente.

**Côté front** : l'appel est déjà fait dans `persistResaIdentity()` de `public/chat.html` en best-effort (ignore l'erreur si 404).

---

## Réservations

### Exploiter le message structuré de Maïa
Quand Maïa reçoit un message type :
> Demande de réservation : mardi 14 avril à 20:00 pour 4 personnes · Contact : Romaric Riquoir (06 12 34 56 78). Merci de confirmer la disponibilité.

→ Elle doit :
1. Vérifier la dispo via un tool (à exposer à l'agent) qui lit `/agenda.json` + la base des résas existantes (somme des couverts pour le service/date).
2. Retourner dispo/pas dispo au user.
3. Si dispo confirmée par le user → insérer en base via `POST /reservations` (endpoint déjà existant).

### Endpoint dispo (à créer ou exposer à l'agent)
`GET /api/availability?date=2026-04-14&service=diner&personnes=4`
→ `{ available: true, remaining: 20 }` basé sur `maxCouverts - reservations_du_service`.

---

## Tools à exposer à Maïa (agent)

L'agent doit recevoir le message structuré du front (format) :
> Demande de réservation : jeudi 16 avril à 12:30 pour 5 personnes · Contact : Romaric Riquoir (06 07 39 14 59). Merci de confirmer la disponibilité.

Puis appeler **automatiquement** ces 2 tools dans l'ordre.

### Tool 1 : `check_availability`
**Paramètres** : `{ date: "YYYY-MM-DD", service: "dejeuner|diner", personnes: number }`
**Retour** :
```js
// Cas dispo
{ available: true, remaining: 12, capacity: 24 }
// Cas complet
{ available: false, reason: "full", capacity: 24, booked: 24 }
// Cas fermé
{ available: false, reason: "closed" }
```
**Impl** : lit `agenda.json` (maxCouverts du service) + SUM couverts des résas existantes pour (date, service).

### Tool 2 : `create_reservation`
**Paramètres** : `{ date, service, heure, personnes, nom, telephone, souhait, user_id? }`
**Retour** : `{ ok: true, reservation_id: "..." }` ou `{ ok: false, error: "..." }`
**Impl** : INSERT dans `reservations` + envoi SMS/email de confirmation (optionnel).

---

## Format de réponse de l'agent avec chips d'action

Le front parse un bloc `[[chips]]…[[/chips]]` dans les messages de Maïa et rend des boutons cliquables.

**Syntaxe** : une chip par ligne, format `Label|action:xxx|flag1|flag2`

**Actions reconnues côté front** :
- `newDate` → rouvre le formulaire de résa
- `cancel` → ferme poliment la conversation résa
- `showDates` → feature premium verrouillée (incite création de compte)
- `retryConfirm` → relance confirmResa (ré-appelle le tool create_reservation)
- `send:<texte libre>` → envoie le texte comme message user

**Flags** :
- `locked` → chip grisée avec cadenas 🔒 (premium)
- `danger` → chip secondaire (Abandonner/Annuler)

### Exemples pour le prompt de Maïa

**Cas refus (complet)** :
```
Désolée, le déjeuner du jeudi 16 avril est complet 😕
Souhaitez-vous essayer une autre date ?
[[chips]]
Changer de date|action:newDate
Voir les dates libres|action:showDates|locked
Abandonner|action:cancel|danger
[[/chips]]
```

**Cas confirmation OK** :
```
✅ C'est confirmé, Romaric ! Je vous attends jeudi 16 avril à 12:30 pour 5 personnes.
Un SMS de confirmation vient de partir au 06 07 39 14 59.
```
(pas de chips, juste le texte)
