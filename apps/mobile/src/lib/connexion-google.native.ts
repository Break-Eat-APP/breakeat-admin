/**
 * « Continuer avec Google » — version TÉLÉPHONE, par le SDK natif.
 *
 * La feuille de Google s'ouvre PAR-DESSUS l'écran et rend un jeton d'identité
 * signé. Pas de navigateur, pas d'adresse de retour à négocier, rien à
 * échanger côté serveur : exactement la forme que prend déjà « Continuer avec
 * Apple » dans cet écran.
 *
 * ── POURQUOI LE SDK NATIF ET PAS `expo-auth-session` ─────────────────
 *
 * `expo-auth-session` ouvrirait un navigateur système et reviendrait par un
 * rebond `breakeat://`. Ça marche, mais c'est le parcours qu'on a déjà quitté
 * pour le paiement Stripe, et pour la même raison : le retour dépend d'un
 * rebond que le système n'honore pas toujours. Expo lui-même renvoie
 * désormais vers ce SDK pour Google.
 *
 * LE COÛT : c'est un module NATIF. Il n'existe pas dans une build déjà
 * publiée — il faut une nouvelle build EAS pour que ce bouton existe sur un
 * téléphone, et il ne s'essaie pas dans Expo Go.
 *
 * ── CE QUE LE SERVEUR FAIT DE CE JETON ───────────────────────────────
 *
 * Il le VÉRIFIE (`auth/social-identity.service.ts`) : signature contre les
 * clés publiques de Google, émetteur, DESTINATAIRE et date. Le destinataire
 * est la part qu'on oublie, et c'est la seule qui compte vraiment — sans
 * elle, un jeton Google parfaitement valide émis pour une AUTRE application
 * ouvrirait un compte ici.
 *
 * Le serveur accepte une LISTE de destinataires (`GOOGLE_CLIENT_IDS`), parce
 * qu'un même compte se présente sous l'identifiant iOS, Android ou Web selon
 * l'appareil et selon la façon dont le SDK demande le jeton. Les trois y
 * figurent donc, et un refus écrit dans le journal le `aud` REÇU à côté de
 * ceux qui étaient attendus.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import {
  GoogleSignin,
  isCancelledResponse,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin';
import type { IdentiteGoogle, IssueGoogle } from '@lib/connexion-google';

/**
 * LES IDENTIFIANTS CLIENTS, ou rien.
 *
 * Ils ne s'inventent pas : ils se créent dans la console Google Cloud, et le
 * schéma d'URL inversé correspondant doit être posé dans la build (voir le
 * greffon dans `app.config.js`). Tant qu'ils sont absents, le bouton ne
 * s'affiche pas — plutôt qu'un bouton qui ouvre une feuille et échoue.
 */
const WEB = identifiantClient(Constants.expoConfig?.extra?.googleWebClientId);
const IOS = identifiantClient(Constants.expoConfig?.extra?.googleIosClientId);

/**
 * N'accepte qu'un identifiant qui en a la FORME.
 *
 * Ce n'est pas de la prudence gratuite : Expo sérialise une valeur `null` de
 * la configuration en `{}`, qui est VRAI en JavaScript. Un simple test de
 * vérité laisserait donc passer un objet vide, le bouton s'afficherait, et la
 * feuille échouerait sur un identifiant illisible. C'est la même garde que
 * `identifiantMarchand` dans `paiement.native.ts`, posée après exactement ce
 * défaut-là.
 *
 * Tout identifiant client Google finit par `.apps.googleusercontent.com`.
 */
function identifiantClient(valeur: unknown): string | undefined {
  return typeof valeur === 'string' && valeur.trim().endsWith('.apps.googleusercontent.com')
    ? valeur.trim()
    : undefined;
}

/**
 * Le bouton peut-il s'afficher ?
 *
 * `webClientId` est exigé dans TOUS les cas : c'est lui qui fait rendre un
 * jeton d'IDENTITÉ par le SDK. Sans lui on obtiendrait un jeton d'accès, que
 * le serveur ne sait pas — et ne doit pas — vérifier.
 *
 * `iosClientId` n'est obligatoire que sur iOS, et seulement parce qu'on
 * n'utilise PAS Firebase : avec un `GoogleService-Info.plist`, le SDK l'y
 * lirait seul. L'exiger sur Android masquerait le bouton sur un appareil
 * pourtant correctement configuré.
 */
export function googleEstConfigure(): boolean {
  return Boolean(WEB) && (Platform.OS !== 'ios' || Boolean(IOS));
}

/**
 * `configure` est posé UNE fois.
 *
 * Il n'est pas idempotent au sens où le rappeler coûterait cher, mais le
 * rappeler à chaque appui mélangerait les réglages si l'un d'eux venait à
 * changer en cours de session. Une fois, au premier usage, et plus jamais.
 */
let prepare = false;
function preparer(): void {
  if (prepare) return;
  GoogleSignin.configure({
    webClientId: WEB,
    ...(IOS ? { iosClientId: IOS } : {}),
    // Les portées par défaut (`email`, `profile`) suffisent : on ne lit RIEN
    // du compte Google du client. On ne lui demande donc rien de plus — une
    // portée superflue est un écran d'autorisation plus long, et une raison
    // de renoncer.
  });
  prepare = true;
}

export async function connecterAvecGoogle(): Promise<IssueGoogle> {
  preparer();

  // Sur Android, les services Google Play peuvent manquer ou être périmés ;
  // le SDK propose alors leur mise à jour. Sur iOS cet appel rend toujours
  // vrai — on ne le conditionne donc pas à la plateforme.
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  const reponse = await GoogleSignin.signIn();

  // L'annulation arrive comme une RÉPONSE, pas comme une exception — à la
  // différence d'Apple, qui lève `ERR_REQUEST_CANCELED`. La traiter comme une
  // erreur afficherait « Connexion impossible » à un client qui a simplement
  // changé d'avis.
  if (isCancelledResponse(reponse)) return { etat: 'annule' };

  if (!isSuccessResponse(reponse)) {
    throw new Error('Google n’a pas terminé la connexion.');
  }

  const { idToken, user } = reponse.data;
  if (!idToken) {
    // Le cas qui signale presque toujours un `webClientId` absent ou faux :
    // la feuille réussit, et il n'y a pas de jeton d'identité au bout.
    throw new Error('Google n’a pas transmis de jeton d’identité.');
  }

  const identite: IdentiteGoogle = {
    jeton: idToken,
    prenom: texte(user.givenName),
    nom: texte(user.familyName),
    nomComplet: texte(user.name),
  };
  return { etat: 'ok', identite };
}

/** Une chaîne utile, ou rien — jamais une chaîne vide, que le serveur garderait. */
function texte(v: string | null | undefined): string | undefined {
  const net = v?.trim();
  return net ? net : undefined;
}
