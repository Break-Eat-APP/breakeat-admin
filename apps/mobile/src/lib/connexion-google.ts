/**
 * « Continuer avec Google » — version NAVIGATEUR, c'est-à-dire absente.
 *
 * Ce fichier sert l'app web. Sur téléphone, Metro lui préfère
 * `connexion-google.native.ts`, qui ouvre la feuille de Google. Les deux
 * exposent les mêmes fonctions : l'écran de connexion n'a pas à savoir sur
 * quoi il tourne — il demande « est-ce disponible ? » et affiche le bouton en
 * conséquence.
 *
 * ── POURQUOI RIEN ICI, ET POURQUOI CE N'EST PAS UN OUBLI ─────────────
 *
 * Le SDK natif de Google n'a pas d'implémentation web : l'importer dans le
 * paquet du navigateur le casserait. Le web demanderait « Google Identity
 * Services », un script chargé depuis Google et un parcours entièrement
 * différent — un second chantier, pas une ligne de plus.
 *
 * C'est déjà la situation d'Apple : `AppleAuthentication.isAvailableAsync()`
 * rend faux dans un navigateur, et le bouton ne s'affiche pas. Sur le web, on
 * s'inscrit donc par adresse et mot de passe. Un bouton visible doit être un
 * bouton qui marche — la règle de cet écran depuis qu'il existe.
 */

/** Ce que Google nous remet, et que l'écran transmet tel quel au serveur. */
export interface IdentiteGoogle {
  /**
   * Le jeton d'identité SIGNÉ — la seule chose que le serveur vérifie
   * (`backend/src/modules/auth/social-identity.service.ts` : signature,
   * émetteur, destinataire, date). Tout le reste n'est qu'un confort
   * d'affichage, et n'est cru que pour remplir un compte neuf.
   */
  jeton: string;
  prenom?: string;
  nom?: string;
  nomComplet?: string;
}

/**
 * `annule` n'est PAS une erreur : le client a refermé la feuille. Lui annoncer
 * un échec pour un geste volontaire est la faute la plus commune de ces
 * parcours — c'est déjà traité ainsi pour Apple.
 */
export type IssueGoogle = { etat: 'ok'; identite: IdentiteGoogle } | { etat: 'annule' };

/** Faux dans un navigateur : le bouton ne s'affiche pas. */
export function googleEstConfigure(): boolean {
  return false;
}

export function connecterAvecGoogle(): Promise<IssueGoogle> {
  // Inatteignable tant que `googleEstConfigure()` garde le bouton. Lever
  // plutôt que rendre `annule` : un silence ici serait un bouton qui ne fait
  // rien, exactement ce qu'on refuse d'afficher.
  return Promise.reject(
    new Error('La connexion Google n’est pas disponible dans le navigateur.'),
  );
}
