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
