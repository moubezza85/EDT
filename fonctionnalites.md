# Fonctionnalités de l'Application EmploiDuTempsTizimi

Cette application est un système complet de gestion et de génération automatique d'emplois du temps, avec une architecture adaptée aux différentes parties prenantes de l'établissement (Administrateur, Surveillant, Formateur).

## 1. Sécurité et Gestion des Rôles
- **Authentification sécurisée** : Connexion par identifiant et mot de passe.
- **Contrôle d'accès basé sur les rôles (RBAC)** :
  - **Admin** : Accès total (Génération, Paramètres, Exports, Validation des demandes).
  - **Surveillant** : Accès opérationnel (Consultation des emplois du temps, Salles libres, Tableau de bord).
  - **Formateur** : Accès restreint (Consultation de son propre emploi du temps, Emploi du temps virtuel, Changement de mot de passe, Soumission de demandes).

## 2. Génération Automatique des Emplois du Temps
- **Moteur de génération avancé** : Utilisation d'algorithmes d'optimisation heuristiques et de contraintes (Mémétique, Hill Climbing, Programmation par Contraintes - CP).
- **Gestion des contraintes (Constraints Management)** :
  - **Contraintes strictes (Hard Constraints)** : Non-chevauchement des séances pour un formateur ou un groupe, disponibilité des salles.
  - **Contraintes souples (Soft Constraints)** : Optimisation des trous dans l'emploi du temps, minimisation des déplacements, limitation du nombre de séances consécutives.
- **Interface de configuration de la génération** : Choix des algorithmes, ajustement des temps de calcul et des paramètres génétiques.

## 3. Paramétrage et Données de Référence
- **Configuration de l'Établissement** :
  - Définition des jours ouvrables (ex: du lundi au samedi).
  - Définition des créneaux horaires journaliers (ex: de 1 à 8 créneaux).
  - Paramétrage de la masse horaire minimale/maximale par formateur et par groupe.
- **Gestion des Ressources** :
  - Ajout et modification des **Formateurs**, **Groupes**, **Salles** (présentielles et virtuelles), et **Modules**.
  - **Affectations (Assignments)** : Liaison entre un formateur, un groupe et un module.
  - **Séances** : Définition des volumes horaires (en nombre de séances) à générer.

## 4. Tableaux de Bord et Consultations
- **Tableau de Bord Global (Dashboard)** : Vue d'ensemble de l'état de l'établissement.
- **Recherche de Salles Libres** : Permet de trouver instantanément une salle non occupée sur un jour et un créneau précis (idéal pour les surveillants).
- **Vue "Mon Emploi" (Formateur)** : Interface dédiée au formateur pour visualiser ses propres séances de la semaine.

## 5. Distanciel et Fusions de Groupes
- **Emploi du temps Virtuel** : Gestion spécifique des séances à distance (distanciel).
- **Fusions en ligne (Online Fusions)** : Capacité de regrouper plusieurs groupes dans une même salle virtuelle avec un seul formateur pour un module commun.

## 6. Demandes et Workflow (Pending Requests)
- **Système de requêtes** : Les formateurs peuvent soumettre des demandes administratives ou d'aménagement (changement de créneau, rattrapage, etc.).
- **Validation** : Interface pour les administrateurs permettant d'approuver ou de rejeter ces demandes.

## 7. Exportation (Exports)
- **Exports multi-formats** :
  - Génération de fichiers PDF pour l'impression et l'affichage.
  - Exportation en Excel pour d'éventuels traitements ultérieurs.
  - Exports personnalisés par Entité (Par Formateur, Par Groupe, Par Salle, ou Global).

## 8. Interface Utilisateur
- **Design Moderne** : Application responsive avec menus latéraux de navigation.
- **UX fluide** : Modification de volumes horaires, cases à cocher pour les jours/créneaux, utilisation de fenêtres modales (Dialog) pour les actions rapides.
