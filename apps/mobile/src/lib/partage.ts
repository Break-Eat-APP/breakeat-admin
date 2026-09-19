import { Share } from 'react-native';

/**
 * Inviter un ami à installer Break Eat.
 *
 * Passe par la feuille de partage du système : WhatsApp, iMessage, mail, tout
 * ce que la personne a sur son téléphone y figure déjà. Rien à intégrer, rien
 * à maintenir, et le client retrouve l'application qu'il utilise tous les
 * jours plutôt qu'un bouton « WhatsApp » qui ne marcherait que pour certains.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CE QUE CE PARTAGE NE FAIT PAS, ET IL FAUT LE SAVOIR AVANT D'EN FAIRE UN
 * PARRAINAGE
 *
 * Il ne dit pas QUI a invité QUI. Ce n'est pas un oubli : un lien vers l'App
 * Store perd tout paramètre en chemin — Apple ne transmet rien à l'application
 * après l'installation. Attribuer automatiquement une installation à un
 * parrain demande un service tiers de lien différé, payant, et qui piste
 * l'appareil.
 *
 * La façon fiable, gratuite et honnête de faire un parrainage reste le CODE
 * QUE LE FILLEUL SAISIT dans l'application après son inscription. C'est le
 * jour où le parrainage sera décidé qu'il faudra l'ajouter ; ce partage-ci
 * fonctionne déjà, et ne coûte rien.
 */

/**
 * La fiche de l'application sur l'App Store.
 *
 * Tirée de `ascAppId` (eas.json). À compléter d'un lien Google Play le jour où
 * l'application y sera publiée — aujourd'hui, seul iOS est en ligne.
 */
export const LIEN_APP_STORE = 'https://apps.apple.com/app/id6496204412';

/** Ouvre la feuille de partage du système avec une invitation prête. */
export async function partagerLApplication(nomDuLieu?: string | null): Promise<void> {
  // Le nom du lieu quand on l'a : « commande au Vélodrome » parle bien plus
  // qu'une invitation générique, et c'est souvent là que le partage se fait.
  const ou = nomDuLieu ? ` quand tu es ${nomDuLieu}` : '';

  await Share.share({
    message:
      `Avec Break Eat, tu commandes à la buvette depuis ton téléphone${ou} — ` +
      `tu récupères ta commande sans faire la queue.\n\n${LIEN_APP_STORE}`,
  });
}
