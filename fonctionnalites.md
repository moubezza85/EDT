# Fonctionnalités de TIZIMI (EDT)

## Vue d'ensemble

TIZIMI est une application web de gestion d'Emploi du Temps (EDT) conçue pour organiser et planifier les séances de cours de façon interactive. Elle permet aux établissements d'enseignement de gérer leurs emplois du temps avec une interface moderne et intuitive.

---

## Fonctionnalités Principales

### 1. 📅 Grille d'Emploi du Temps Dynamique
- Affichage des séances organisées par **jour** et par **créneau horaire**
- Vue claire et structurée de l'ensemble des sessions planifiées
- Interface visuelle interactive et facile à lire

### 2. 🔍 Filtrage Multi-Critères
- Filtrer les séances par **Formateur** (enseignant)
- Filtrer les séances par **Groupe** (classe/promotion)
- Filtrer les séances par **Salle** (local/amphithéâtre)
- Mise à jour instantanée de la grille lors de la sélection d'un filtre
- Possibilité de réinitialiser les filtres

### 3. 🖱️ Drag & Drop (Glisser-Déposer)
- Déplacer les séances directement dans la grille pour les reprogrammer
- Interface intuitive sans nécessité de formulaires complexes
- Repositionnement rapide des cours d'un créneau à un autre

### 4. ⚠️ Détection de Conflits
- Détection automatique des conflits lors du déplacement d'une séance
- Alerte immédiate si le créneau cible est déjà occupé
- Prévention des doubles réservations de salles ou de formateurs

### 5. 🏫 Modal de Sélection de Salle
- En cas de conflit, une fenêtre modale s'ouvre pour proposer des alternatives
- Sélection d'une salle disponible pour résoudre le conflit
- Validation rapide sans quitter l'interface principale

### 6. 🔄 Rafraîchissement en Temps Réel
- Bouton de rechargement pour récupérer les dernières données
- Synchronisation avec l'API backend via **React Query**
- Mise en cache intelligente des données pour des performances optimales

### 7. 📱 Design Responsive
- Interface adaptée aux écrans **desktop** et **mobile**
- Mise en page fluide grâce à **Tailwind CSS**
- Composants UI modernes fournis par **shadcn/ui**

### 8. 🔐 Authentification
- Module de gestion des utilisateurs et des connexions
- Accès sécurisé à l'application
- Gestion des sessions utilisateurs

---

## Stack Technique

| Couche        | Technologie           |
|---------------|-----------------------|
| Frontend      | React + TypeScript    |
| Build         | Vite                  |
| Style         | Tailwind CSS          |
| Composants UI | shadcn/ui             |
| Drag & Drop   | React DnD             |
| Data Fetching | React Query           |
| Backend       | API séparée (dossier `backend/`) |

---

## Structure du Projet

```
src/
├── api/          → Appels API et endpoints
├── app/          → Configuration principale de l'app
├── auth/         → Module d'authentification
├── components/   → Composants React réutilisables
├── hooks/        → Hooks personnalisés
├── lib/          → Utilitaires et helpers
├── pages/        → Pages principales de l'application
└── types/        → Types TypeScript
```

---

*Fichier généré le 23/02/2026*
