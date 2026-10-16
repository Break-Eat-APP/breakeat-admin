/**
 * LE CLIENT NE DOIT PAS SE RECONNECTER CHEZ FLAIX.
 *
 * Le club colle un lien qui porte des ÉTIQUETTES, à la façon de l'ancien
 * back-office Shapper :
 *
 *   …/o/marseille-vs-gap?firstname=[#firstname]&lastname=[#lastname]
 *                        &mail=[#mail]&phone=[#Votre portable]
 *
 * Ces étiquettes doivent être remplacées par l'identité du client AVANT
 * d'ouvrir la page : c'est tout le mécanisme de la marque blanche. Sans ce
 * remplacement, deux choses cassent, et la seconde est invisible :
 *
 *  1. Flaix reçoit `firstname=[#firstname]` et pré-remplit le formulaire avec
 *     cette suite de caractères ;
 *  2. surtout, le `#` d'une étiquette ouvre un FRAGMENT d'URL — et un
 *     navigateur n'envoie jamais le fragment au serveur. Tout ce qui suit la
 *     première étiquette n'arriverait donc **jamais** chez Flaix. Le lien
 *     paraîtrait correct dans l'admin et serait tronqué à l'ouverture.
 *
 * On travaille donc sur la CHAÎNE BRUTE, sans passer par `new URL()` : le
 * découpage standard placerait tout après le premier `#` dans le fragment, et
 * perdrait les trois quarts des étiquettes.
 *
 * ⚠️ Cette adresse porte le nom, l'adresse e-mail et le téléphone du client.
 * La réponse qui la contient ne doit jamais être mise en cache partagé — voir
 * l'en-tête `Cache-Control` du contrôleur qui l'emploie. À terme, un jeton
 * court signé par Break Eat serait plus propre qu'une identité en clair dans
 * une adresse (voir `brain/FRONTIERE_FLAIX_OPS.md`, point 1 du contrat).
 */

/** Ce qu'on sait du client connecté. Tout est facultatif. */
export interface ClientConnecte {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  displayName?: string | null;
}

/**
 * Les noms d'étiquettes reconnus, et le champ qu'ils désignent.
 *
 * Plusieurs orthographes par champ, et ce n'est pas du zèle : les liens
 * existants viennent de Shapper, où l'étiquette porte le LIBELLÉ du champ tel
 * qu'il a été nommé par le club (« Votre portable »). Refuser ce qu'il a déjà
 * écrit l'obligerait à retoucher vingt liens à la main.
 */
const ETIQUETTES: Record<string, keyof ClientConnecte> = {
  firstname: 'firstName',
  prenom: 'firstName',
  lastname: 'lastName',
  nom: 'lastName',
  name: 'displayName',
  nomcomplet: 'displayName',
  displayname: 'displayName',
  mail: 'email',
  email: 'email',
  courriel: 'email',
  phone: 'phone',
  tel: 'phone',
  telephone: 'phone',
  portable: 'phone',
  votreportable: 'phone',
  mobile: 'phone',
};

/**
 * Ramène un nom d'étiquette à sa forme comparable.
 *
 * « Votre portable », « votre_portable » et « VOTRE PORTABLE » désignent la
 * même chose. On retire aussi les accents : « téléphone » et « telephone »
 * ne doivent pas se comporter différemment selon qui a saisi le lien.
 */
function normaliser(nom: string): string {
  let brut = nom;
  try {
    brut = decodeURIComponent(nom);
  } catch {
    // Une séquence d'échappement invalide : on garde le texte tel quel plutôt
    // que de perdre l'étiquette.
  }
  return brut
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** `[#…]` — la syntaxe d'étiquette, héritée de Shapper. */
const ETIQUETTE = /\[#([^\]]*)\]/g;

/**
 * Remplace les étiquettes par l'identité du client.
 *
 * Un paramètre dont l'étiquette ne peut PAS être remplie — client non
 * connecté, téléphone non renseigné, étiquette inconnue — est **retiré en
 * entier**. Trois raisons de retirer plutôt que de laisser vide :
 *
 *  - `phone=` vide fait afficher un champ vide chez Flaix, ce qu'il aurait
 *    fait de toute façon ;
 *  - `phone=[#Votre portable]` ferait écrire ce texte dans le formulaire ;
 *  - et le `#` restant tronquerait tout ce qui suit.
 *
 * Le client non connecté obtient donc l'adresse nue : Flaix lui demandera ses
 * coordonnées, ce qui est le repli correct.
 */
/**
 * À DÉFAUT DE PRÉNOM ET DE NOM, ON LES TIRE DU NOM D'AFFICHAGE.
 *
 * Un compte ouvert par Apple ou Google n'a longtemps porté qu'un
 * `displayName` — « Rémi Notta » — et pas les deux champs séparés. Sans ce
 * repli, ces clients voient Flaix leur redemander un prénom que Break Eat
 * connaît pourtant.
 *
 * On ne découpe QUE s'il y a un espace. Un nom d'affichage d'un seul mot est
 * le plus souvent la partie gauche d'une adresse e-mail (« remi.notta »), et
 * l'écrire dans un champ « Prénom » serait pire que de le laisser vide.
 *
 * Le premier mot est le prénom, TOUT le reste est le nom : « Jean-Pierre De
 * La Tour » donne « Jean-Pierre » et « De La Tour ».
 */
function complete(client: ClientConnecte | null): ClientConnecte | null {
  if (!client) return null;
  const aPrenom = !!client.firstName?.trim();
  const aNom = !!client.lastName?.trim();
  if (aPrenom && aNom) return client;

  const affiche = client.displayName?.trim() ?? '';
  const mots = affiche.split(/\s+/).filter(Boolean);
  if (mots.length < 2) return client;

  return {
    ...client,
    firstName: aPrenom ? client.firstName : mots[0],
    lastName: aNom ? client.lastName : mots.slice(1).join(' '),
  };
}

export function personnaliserLien(url: string, brut: ClientConnecte | null): string {
  const client = complete(brut);
  const coupure = url.indexOf('?');
  if (coupure === -1) return url;

  const base = url.slice(0, coupure);
  const parametres = url.slice(coupure + 1);
  if (!parametres) return base;

  const gardes: string[] = [];
  for (const segment of parametres.split('&')) {
    if (!segment) continue;
    const egal = segment.indexOf('=');
    // Un paramètre sans `=` (un drapeau) ne porte pas d'étiquette : on le garde.
    if (egal === -1) {
      gardes.push(segment);
      continue;
    }

    const cle = segment.slice(0, egal);
    const valeur = segment.slice(egal + 1);
    if (!ETIQUETTE.test(valeur)) {
      ETIQUETTE.lastIndex = 0;
      gardes.push(segment);
      continue;
    }
    ETIQUETTE.lastIndex = 0;

    let complet = true;
    const remplacee = valeur.replace(ETIQUETTE, (_, nom: string) => {
      const champ = ETIQUETTES[normaliser(nom)];
      const brut = champ && client ? client[champ] : null;
      const texte = typeof brut === 'string' ? brut.trim() : '';
      if (!texte) {
        complet = false;
        return '';
      }
      return encodeURIComponent(texte);
    });

    // Les ESPACES LITTÉRAUX du modèle — « [#firstname] [#lastname] » — ne
    // passent pas par `encodeURIComponent`, qui ne traite que les valeurs
    // remplacées. Un espace brut dans une adresse est invalide, et certains
    // clients y tronquent tout simplement l'URL. On ne touche qu'aux segments
    // qui portaient une étiquette : ailleurs, le lien du club reste intact.
    if (complet) gardes.push(`${cle}=${remplacee.replace(/ /g, '%20')}`);
  }

  return gardes.length > 0 ? `${base}?${gardes.join('&')}` : base;
}

/** Vrai si ce lien attend une identité — utile pour n'aller la chercher qu'alors. */
export function porteDesEtiquettes(url: string): boolean {
  ETIQUETTE.lastIndex = 0;
  const oui = ETIQUETTE.test(url);
  ETIQUETTE.lastIndex = 0;
  return oui;
}
