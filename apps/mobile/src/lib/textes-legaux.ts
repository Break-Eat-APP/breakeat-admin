/**
 * LES QUATRE DOCUMENTS LÉGAUX, dans l'application.
 *
 * Pourquoi du texte dans l'app plutôt que des PDF :
 *
 *  · un PDF dans une app mobile s'ouvre dans un lecteur externe, se lit à la
 *    loupe et ne suit ni la taille de police ni le lecteur d'écran du client.
 *    Apple demande que la politique de confidentialité soit ACCESSIBLE — un
 *    document qu'on doit pincer pour lire ne l'est pas vraiment ;
 *  · quatre PDF, c'est quatre téléchargements et quatre allers-retours hors
 *    de l'app ;
 *  · le texte d'ici se lit sans réseau. Au stade, c'est souvent le cas.
 *
 * ⚠️ CE FICHIER EST LA VERSION PUBLIÉE. Le modifier change ce que lisent les
 * clients, et demande une nouvelle build — c'est le régime normal d'un
 * document contractuel : la version acceptée doit rester consultable.
 *
 * La politique de confidentialité doit AUSSI exister à une adresse web
 * publique : App Store Connect réclame une URL, pas un écran d'application.
 */

export type CleDocument = 'mentions' | 'confidentialite' | 'cgu' | 'cgv';

export interface SectionLegale {
  /** Numérotée comme dans le document signé : on doit pouvoir citer « § 7 ». */
  titre: string;
  paragraphes: string[];
}

export interface DocumentLegal {
  cle: CleDocument;
  /** Ce qui s'affiche dans la liste. Court : la liste se balaie. */
  titre: string;
  /** Une phrase qui dit à quoi sert le document, pour choisir sans ouvrir. */
  resume: string;
  version: string;
  sections: SectionLegale[];
}

/** L'éditeur, écrit une fois : quatre copies divergeraient au premier changement. */
const EDITEUR = [
  'BREAK EAT APP, nom commercial BREAK EAT, société par actions simplifiée (SAS) de droit français.',
  'Siège social : 91 allée des Chardonnerets, 13013 Marseille, France.',
  'SIREN : 925 187 395 — RCS Marseille 925 187 395.',
  'Capital social : 1 000 €. TVA intracommunautaire : FR26925187395.',
  'Président et directeur de la publication : Rémi Notta.',
  'E-mail : reminotta@breakeatapp.com — Téléphone : 06 46 69 56 75.',
  'Site : https://breakeatapp.com',
];

const VERSION = 'Version du 19 octobre 2026';

const MENTIONS: DocumentLegal = {
  cle: 'mentions',
  titre: 'Mentions légales',
  resume: 'Qui édite l’application, qui l’héberge, et comment nous joindre.',
  version: VERSION,
  sections: [
    { titre: '1. Éditeur de l’application et du site', paragraphes: EDITEUR },
    {
      titre: '2. Directeur de la publication',
      paragraphes: [
        'Le directeur de la publication est Rémi Notta, en sa qualité de Président de la société BREAK EAT APP.',
      ],
    },
    {
      titre: '3. Hébergement',
      paragraphes: [
        'Le serveur de l’application et sa base de données sont hébergés par Railway Corporation, San Francisco, Californie, États-Unis.',
        'Le site internet breakeatapp.com est hébergé par OVH SAS, société par actions simplifiée au capital de 50 000 000 €, RCS Lille Métropole 424 761 419, dont le siège est situé 2 rue Kellermann, 59100 Roubaix, France — téléphone : 09 72 10 10 07.',
        'Les interfaces d’administration destinées aux clubs et aux points de vente sont hébergées par Vercel Inc.',
      ],
    },
    {
      titre: '4. Présentation du service',
      paragraphes: [
        'Break Eat App est une solution numérique de commande en ligne destinée notamment aux spectateurs d’événements sportifs et aux visiteurs de lieux événementiels.',
        'L’application permet de consulter les produits proposés par des points de vente partenaires, de passer commande, de payer en ligne et de récupérer la commande auprès du point de vente concerné.',
        'Le service vise à faciliter la commande et le retrait de produits auprès de buvettes, points de restauration et autres commerces présents dans les stades, arénas et lieux événementiels.',
      ],
    },
    {
      titre: '5. Rôle de la plateforme, vendeurs et paiements',
      paragraphes: [
        'Les produits proposés dans l’application sont vendus par les buvettes partenaires. Ces établissements sont responsables des produits qu’ils proposent, de leur préparation et de leur remise au client, conformément aux règles applicables.',
        'Le paiement en ligne est traité au moyen de Stripe Connect. Break Eat App ne conserve aucune donnée de carte bancaire : elles sont saisies dans le parcours du prestataire de paiement et ne transitent pas par nos serveurs.',
        'Les présentes mentions légales ne remplacent ni les conditions générales d’utilisation, ni les conditions générales de vente applicables à chaque commande.',
      ],
    },
    {
      titre: '6. Propriété intellectuelle',
      paragraphes: [
        'La dénomination Break Eat App, la marque Break Eat, les éléments graphiques, les logos, les interfaces, les textes, les logiciels et les autres contenus propres à la plateforme sont protégés par les règles applicables en matière de propriété intellectuelle, sous réserve des droits détenus par des tiers.',
        'Toute reproduction, représentation, adaptation ou exploitation non autorisée de ces éléments est interdite, sauf autorisation préalable du titulaire des droits ou exception prévue par la loi.',
        'Les marques, logos, photographies et contenus appartenant aux établissements partenaires ou à d’autres tiers demeurent la propriété de leurs titulaires respectifs.',
      ],
    },
    {
      titre: '7. Disponibilité et fonctionnement',
      paragraphes: [
        'Break Eat App met en œuvre des moyens raisonnables pour assurer l’accessibilité et le bon fonctionnement de l’application et du site internet.',
        'L’accès aux services peut être temporairement interrompu, notamment en cas de maintenance, de mise à jour, d’incident technique, de difficulté de connectivité ou de circonstance indépendante de la volonté de la société.',
        'Break Eat App s’efforce de limiter les interruptions et de rétablir le service dans des délais raisonnables. Cette disposition ne saurait exclure ou limiter une responsabilité lorsque la loi ne le permet pas.',
      ],
    },
    {
      titre: '8. Données personnelles',
      paragraphes: [
        'L’utilisation de l’application entraîne le traitement de données à caractère personnel, notamment pour la gestion des comptes, des commandes, des paiements, de l’assistance et de la sécurité du service.',
        'Les finalités, les bases légales, les destinataires, les durées de conservation, les transferts éventuels hors de l’Espace économique européen et les droits des personnes sont détaillés dans la politique de confidentialité, accessible depuis cet écran.',
        'Pour toute question relative aux données personnelles : reminotta@breakeatapp.com.',
      ],
    },
    {
      titre: '9. Conditions d’utilisation et de commande',
      paragraphes: [
        'L’utilisation de l’application est encadrée par les conditions générales d’utilisation, accessibles depuis cet écran.',
        'Les commandes effectuées par l’intermédiaire de l’application sont encadrées par les conditions générales de vente, également accessibles depuis cet écran et présentées avant la validation de la commande.',
      ],
    },
    {
      titre: '10. Contact',
      paragraphes: [
        'BREAK EAT APP — BREAK EAT',
        '91 allée des Chardonnerets, 13013 Marseille, France',
        'E-mail : reminotta@breakeatapp.com',
        'Site : https://breakeatapp.com',
      ],
    },
  ],
};

const CONFIDENTIALITE: DocumentLegal = {
  cle: 'confidentialite',
  titre: 'Politique de confidentialité',
  resume: 'Quelles données nous traitons, pourquoi, combien de temps, et tes droits.',
  version: VERSION,
  sections: [
    {
      titre: '1. Responsable du traitement',
      paragraphes: [
        'Le responsable du traitement est BREAK EAT APP, SAS au capital de 1 000 €, RCS Marseille 925 187 395, dont le siège social est situé 91 allée des Chardonnerets, 13013 Marseille, France.',
        'Contact relatif aux données personnelles : reminotta@breakeatapp.com. À la date de cette version, aucun délégué à la protection des données (DPO) distinct n’est désigné.',
      ],
    },
    {
      titre: '2. Données concernées',
      paragraphes: [
        'Les données traitées comprennent : nom et prénom, adresse e-mail, numéro de téléphone, informations de compte, commandes et historique de commandes, informations nécessaires au suivi d’un paiement ou d’une réclamation, préférences de communication, choix de consentement, et données techniques de connexion.',
        'Lorsque l’utilisateur autorise la géolocalisation, sa position est utilisée pour afficher les lieux proches. Elle n’est ni enregistrée ni conservée : elle sert au calcul de la distance, le temps de la recherche.',
        'Les données de carte bancaire sont traitées exclusivement par le prestataire de paiement. Break Eat App ne les reçoit pas et ne les conserve pas.',
      ],
    },
    {
      titre: '3. Finalités et bases légales',
      paragraphes: [
        'Création et gestion du compte, authentification et sécurité : exécution du contrat et intérêt légitime à sécuriser le service.',
        'Prise de commande, confirmation, retrait, service après-vente et gestion des réclamations : exécution du contrat.',
        'Suivi des paiements, prévention de la fraude et gestion des litiges : exécution du contrat, obligations légales et intérêt légitime selon le traitement.',
        'Comptabilité et conservation des pièces justificatives : respect des obligations légales.',
        'Géolocalisation facultative : consentement, retirable à tout moment dans les réglages de l’appareil.',
        'Notifications commerciales : consentement, retirable à tout moment.',
        'Mesure d’audience : intérêt légitime. Elle est réalisée par nos propres serveurs, sans outil publicitaire ni prestataire d’analyse tiers.',
      ],
    },
    {
      titre: '4. Caractère obligatoire ou facultatif',
      paragraphes: [
        'Les informations indispensables à la création du compte ou à l’exécution d’une commande sont indiquées au moment de leur collecte. Sans elles, certaines fonctions — création du compte, commande, suivi d’une réclamation — ne sont pas disponibles.',
        'La géolocalisation est facultative : la recherche d’un lieu par son nom fonctionne sans elle.',
        'Le refus des notifications commerciales n’empêche pas d’utiliser le service. Les messages nécessaires au suivi d’une commande peuvent toutefois être envoyés.',
      ],
    },
    {
      titre: '5. Destinataires et prestataires',
      paragraphes: [
        'Les données sont accessibles, dans la limite de leurs missions, aux personnes habilitées de Break Eat App et aux buvettes partenaires pour les commandes qui les concernent.',
        'Les prestataires intervenant dans le fonctionnement du service sont : Railway (hébergement du serveur et de la base de données), OVH (hébergement du site), Vercel (interfaces d’administration), Stripe (paiement), Expo et Apple (acheminement des notifications).',
        'Aucun outil publicitaire, aucun traceur commercial et aucun prestataire de mesure d’audience tiers n’est intégré à l’application.',
      ],
    },
    {
      titre: '6. Transferts hors de l’Espace économique européen',
      paragraphes: [
        'Certains de ces prestataires sont établis aux États-Unis et peuvent traiter des données en dehors de l’Espace économique européen.',
        'Ces transferts sont encadrés par les garanties prévues par le RGPD, notamment les clauses contractuelles types de la Commission européenne ou, le cas échéant, une décision d’adéquation.',
      ],
    },
    {
      titre: '7. Durées de conservation',
      paragraphes: [
        'Les données de compte sont conservées pendant la durée d’utilisation du compte, puis supprimées ou anonymisées après une demande de suppression.',
        'Les pièces comptables et justificatifs de transaction sont conservés pendant les durées légales applicables, y compris après la suppression du compte : la loi l’impose, et les comptes du club en dépendent.',
        'Les données de support sont conservées le temps nécessaire au traitement de la demande et à la gestion d’un éventuel litige.',
        'Les données de prospection sont conservées jusqu’au retrait du consentement.',
      ],
    },
    {
      titre: '8. Droits des personnes',
      paragraphes: [
        'Dans les conditions prévues par le RGPD, tu peux demander l’accès à tes données, leur rectification, leur effacement, la limitation du traitement, t’opposer à certains traitements et, lorsque les conditions sont réunies, obtenir leur portabilité.',
        'Lorsque le traitement repose sur le consentement, celui-ci peut être retiré à tout moment pour l’avenir, sans remettre en cause ce qui a été fait avant.',
        'Tu peux également définir des directives relatives au sort de tes données après ton décès, dans les conditions prévues par le droit français.',
        'Pour exercer ces droits : reminotta@breakeatapp.com. Une vérification d’identité proportionnée peut être demandée en cas de doute raisonnable.',
      ],
    },
    {
      titre: '9. Réclamation auprès de la CNIL',
      paragraphes: [
        'Si tu estimes, après nous avoir contactés, que tes droits ne sont pas respectés, tu peux adresser une réclamation à la Commission nationale de l’informatique et des libertés (CNIL), via https://www.cnil.fr.',
      ],
    },
    {
      titre: '10. Sécurité',
      paragraphes: [
        'Break Eat App met en œuvre des mesures techniques et organisationnelles adaptées afin de protéger les données contre la perte, l’altération, la divulgation ou l’accès non autorisé.',
        'Aucun système de transmission ou de stockage ne pouvant être garanti comme absolument sûr, nous te demandons également de préserver la confidentialité de tes identifiants et de signaler toute activité suspecte.',
      ],
    },
    {
      titre: '11. Géolocalisation',
      paragraphes: [
        'La géolocalisation est utilisée uniquement pendant que l’application est ouverte, pour afficher les lieux et points de retrait proches.',
        'Il n’y a aucun suivi en arrière-plan : l’application ne demande ni n’utilise la position lorsqu’elle n’est pas au premier plan.',
        'L’autorisation se refuse ou se retire à tout moment dans les réglages de l’appareil.',
      ],
    },
    {
      titre: '12. Notifications',
      paragraphes: [
        'Les notifications liées à une commande ou au fonctionnement du compte sont envoyées lorsqu’elles sont nécessaires à la fourniture du service.',
        'Les notifications à caractère commercial sont distinctes et reposent sur le consentement. Il peut être retiré à tout moment depuis les réglages de l’application ou de l’appareil, sans effet sur les notifications liées à une commande.',
      ],
    },
    {
      titre: '13. Traceurs et mesure d’audience',
      paragraphes: [
        'L’application ne contient ni cookie publicitaire, ni traceur tiers, ni outil d’analyse externe.',
        'La mesure d’audience est réalisée par nos propres serveurs. Elle repose sur un identifiant d’installation tiré au sort par l’application, qui ne désigne aucune personne et sert uniquement à ne pas compter deux fois le même appareil. Ni position ni adresse IP n’y sont associées.',
      ],
    },
    {
      titre: '14. Suppression du compte',
      paragraphes: [
        'Tu peux supprimer ton compte directement depuis l’application, dans le menu Profil, ou en écrivant à reminotta@breakeatapp.com.',
        'La suppression efface ton nom, ton prénom, ton téléphone, ton adresse e-mail, ton mot de passe, tes connexions Apple ou Google, tes sessions et tes notifications.',
        'Tes commandes passées sont conservées sans ton nom : la loi impose de garder les pièces comptables, et les comptes du club en dépendent. Elles ne permettent plus de t’identifier.',
      ],
    },
    {
      titre: '15. Modifications',
      paragraphes: [
        'La présente politique peut être mise à jour pour refléter les évolutions du service ou du cadre légal. La version applicable est publiée dans l’application avec sa date de mise à jour.',
        'Lorsqu’une modification nécessite une information particulière ou un nouveau consentement, les mesures appropriées sont prises avant le nouveau traitement.',
      ],
    },
    {
      titre: '16. Contact',
      paragraphes: [
        'BREAK EAT APP — 91 allée des Chardonnerets, 13013 Marseille, France',
        'E-mail : reminotta@breakeatapp.com — Téléphone : 06 46 69 56 75',
      ],
    },
  ],
};

const CGU: DocumentLegal = {
  cle: 'cgu',
  titre: 'Conditions générales d’utilisation',
  resume: 'Les règles d’usage de l’application : compte, commande, retrait, réclamations.',
  version: VERSION,
  sections: [
    { titre: '1. Éditeur et contact', paragraphes: EDITEUR },
    {
      titre: '2. Objet et périmètre',
      paragraphes: [
        'Les présentes conditions générales d’utilisation régissent l’accès à l’application Break Eat App et son utilisation.',
        'Le service est proposé lors d’événements et sur les sites partenaires où Break Eat est activé. Il permet de consulter les points de vente et les produits proposés, de commander et de payer dans l’application, puis de retirer la commande au point indiqué.',
        'Les ventes de produits et leurs conditions commerciales sont encadrées par les conditions générales de vente. La politique de confidentialité décrit les traitements de données personnelles.',
      ],
    },
    {
      titre: '3. Acceptation et version applicable',
      paragraphes: [
        'L’utilisateur peut consulter les présentes conditions avant d’utiliser les fonctionnalités concernées. L’application recueille l’acceptation lors de l’inscription.',
        'La version applicable est celle présentée au moment de l’acceptation. Les modifications sont publiées dans l’application et, lorsqu’elles sont substantielles, portées à la connaissance des utilisateurs ; une nouvelle acceptation est demandée lorsque cela est requis.',
      ],
    },
    {
      titre: '4. Création et sécurité du compte',
      paragraphes: [
        'La création d’un compte est nécessaire pour commander. L’utilisateur fournit des informations exactes et à jour, notamment son nom, son prénom, son adresse e-mail et son numéro de téléphone.',
        'Les comptes sont personnels et les identifiants ne doivent pas être partagés. L’utilisateur protège ses identifiants et signale rapidement toute utilisation suspecte.',
        'L’utilisateur s’interdit de créer un compte frauduleux, d’usurper l’identité d’un tiers, de contourner les dispositifs de sécurité ou d’utiliser le service à des fins illicites. L’utilisation de l’application est soumise aux règles applicables aux mineurs et à la capacité de contracter.',
      ],
    },
    {
      titre: '5. Fonctionnement du service',
      paragraphes: [
        'Les produits et leurs prix sont fixés par les buvettes ou restaurateurs partenaires. Break Eat présente l’offre et fournit l’interface de commande. Aucun frais de service distinct n’est ajouté au prix affiché.',
        'Aucune livraison n’est proposée : les commandes sont retirées sur le site de l’événement, au point indiqué dans l’application.',
        'Les créneaux de retrait peuvent être choisis ou estimés selon l’événement. Les estimations de préparation ne garantissent pas une heure exacte et peuvent varier selon l’affluence, la disponibilité des produits, la connexion ou l’organisation du partenaire.',
        'L’utilisateur vérifie son panier, les quantités, le prix total et le point de retrait avant le paiement.',
      ],
    },
    {
      titre: '6. Confirmation de commande',
      paragraphes: [
        'La commande est confirmée lorsque le paiement a été accepté et que l’application affiche une confirmation. L’utilisateur conserve le numéro ou le code de commande nécessaire au retrait.',
        'Avant la validation définitive, les informations relatives aux produits, aux quantités, aux prix, au montant total et au vendeur sont présentées. Le parcours de commande indique clairement l’obligation de paiement.',
      ],
    },
    {
      titre: '7. Rôle des partenaires et informations sur les produits',
      paragraphes: [
        'Les buvettes ou restaurateurs partenaires sont les vendeurs des produits proposés dans l’application. Ils fixent les prix et sont responsables de la préparation, de la qualité, de la conservation, de l’hygiène et de la remise des produits, ainsi que des informations relatives aux produits et aux allergènes.',
        'Break Eat reçoit les réclamations des clients et coordonne, lorsque cela est pertinent, leur résolution avec la buvette : correction, remplacement ou remboursement selon la situation. Cette coordination ne supprime pas les obligations légales respectives de chaque partie.',
      ],
    },
    {
      titre: '8. Paiement et justificatifs',
      paragraphes: [
        'Le paiement est effectué dans l’application par l’intermédiaire de Stripe Connect. Break Eat App ne reçoit ni ne conserve aucune donnée de carte bancaire.',
        'Le paiement est encaissé par Break Eat App puis reversé à la buvette partenaire pour les produits qu’elle a vendus.',
        'Une confirmation de commande et un reçu sont mis à disposition dans l’application. Les documents de facturation sont établis conformément aux règles applicables et identifient le vendeur des produits.',
      ],
    },
    {
      titre: '9. Retrait des commandes',
      paragraphes: [
        'L’utilisateur se présente au point de retrait indiqué dans l’application et présente le numéro ou le code de commande demandé. Il suit les consignes du personnel et les règles du site partenaire.',
        'En cas de retard, de non-retrait, de fermeture du point de vente ou de difficulté de remise, l’utilisateur peut écrire à reminotta@breakeatapp.com. Les conséquences commerciales sont régies par les conditions générales de vente et par la loi.',
      ],
    },
    {
      titre: '10. Annulation, indisponibilité et remboursement',
      paragraphes: [
        'Après confirmation, une commande ne peut normalement plus être modifiée ou annulée à la seule demande du client, sous réserve des droits légaux applicables et des situations où la commande ne peut être fournie. Une demande peut être examinée au cas par cas selon l’état de préparation.',
        'En cas de double commande ou de double paiement confirmé, Break Eat vérifie la situation et coordonne l’annulation et le remboursement de la commande en trop.',
        'Si un produit est indisponible, un remplacement ne peut être effectué qu’avec l’accord du client ; à défaut, la commande non fournie est remboursée.',
        'En cas d’annulation de l’événement, toute commande payée et non fournie est remboursée. En cas de report, le client est remboursé si la commande ne peut être honorée à la date initialement prévue. Le non-retrait ne donne en principe pas lieu à remboursement, sous réserve des droits impératifs applicables.',
      ],
    },
    {
      titre: '11. Réclamations',
      paragraphes: [
        'Les réclamations relatives au compte, à l’application ou à une commande peuvent être adressées à reminotta@breakeatapp.com.',
        'Break Eat reçoit la réclamation et coordonne avec la buvette la correction de la commande, le remplacement ou le remboursement selon le cas. Le numéro de commande peut être demandé.',
        'Le client est invité à signaler le problème dans les meilleurs délais, sans que cela limite ses droits légaux.',
      ],
    },
    {
      titre: '12. Géolocalisation et notifications',
      paragraphes: [
        'La géolocalisation est facultative et sert à afficher les événements et lieux à proximité. Elle n’est utilisée que pendant l’utilisation de l’application. Le refus de la géolocalisation n’empêche pas d’accéder aux fonctions qui n’en ont pas besoin.',
        'Les notifications peuvent être transactionnelles ou commerciales. Les notifications commerciales sont soumises à un consentement distinct, retirable à tout moment.',
      ],
    },
    {
      titre: '13. Données personnelles',
      paragraphes: [
        'L’application traite notamment le nom, le prénom, l’adresse e-mail, le numéro de téléphone et les données nécessaires à la gestion du compte et des commandes.',
        'Les finalités, destinataires, prestataires, durées de conservation et droits des personnes figurent dans la politique de confidentialité, accessible depuis cet écran.',
      ],
    },
    {
      titre: '14. Suppression du compte et conservation des données',
      paragraphes: [
        'L’utilisateur peut supprimer son compte depuis l’application, dans le menu Profil, ou en contactant Break Eat.',
        'Certaines données sont conservées pendant la durée nécessaire au respect d’obligations légales, comptables ou fiscales, ou à l’établissement, l’exercice ou la défense de droits en justice, conformément à la politique de confidentialité.',
      ],
    },
    {
      titre: '15. Propriété intellectuelle',
      paragraphes: [
        'L’application, son code, sa structure, ses interfaces, sa marque, ses logos, ses éléments graphiques, ses textes et contenus éditoriaux sont protégés par les droits de propriété intellectuelle applicables.',
        'L’utilisateur bénéficie d’un droit personnel, non exclusif et non cessible d’utilisation normale de l’application. Toute reproduction, extraction, adaptation, diffusion ou exploitation non autorisée est interdite, sous réserve des exceptions prévues par la loi.',
      ],
    },
    {
      titre: '16. Disponibilité, maintenance et sécurité',
      paragraphes: [
        'Break Eat s’efforce d’assurer le fonctionnement de l’application sans garantir une disponibilité ininterrompue. L’utilisateur est responsable de son accès à Internet ; la couverture réseau sur le site de l’événement n’est pas garantie.',
        'Des interruptions peuvent résulter de maintenances, de mises à jour, d’incidents techniques, de problèmes de réseau, de défaillances de prestataires ou d’exigences de sécurité.',
        'Break Eat peut suspendre tout ou partie du service pour maintenance, incident, sécurité ou nécessité opérationnelle. Ces mesures n’excluent pas les remboursements dus ni les autres obligations légales applicables.',
      ],
    },
    {
      titre: '17. Responsabilité',
      paragraphes: [
        'Chaque partie répond de ses propres obligations conformément au droit applicable. Les partenaires répondent notamment de leurs obligations en qualité de vendeurs des produits, de leur préparation et de leur remise. Break Eat répond de ses obligations relatives à l’application et aux services qu’elle fournit.',
        'Aucune stipulation des présentes conditions ne limite ou n’exclut une responsabilité ou un droit qui ne peut légalement l’être, notamment les droits impératifs des consommateurs.',
      ],
    },
    {
      titre: '18. Suspension et fermeture du compte',
      paragraphes: [
        'Break Eat peut restreindre ou suspendre un compte en cas de fraude ou tentative de fraude, d’utilisation abusive ou malveillante, de violation des présentes conditions ou des règles de l’événement, ou de risque pour la sécurité du compte ou du service.',
        'La mesure peut être immédiate lorsque l’urgence le justifie ; elle reste proportionnée. Lorsque cela est approprié, l’utilisateur est informé de la mesure et de son motif.',
        'Une interruption ou cessation du service ne remet pas en cause les obligations déjà nées, notamment le traitement des commandes payées et les remboursements dus.',
      ],
    },
    {
      titre: '19. Modification des conditions',
      paragraphes: [
        'Break Eat peut modifier les présentes conditions pour tenir compte de l’évolution de l’application, du service ou de la réglementation. La version mise à disposition comporte une date de mise à jour.',
        'En cas de modification substantielle, l’utilisateur est informé par un moyen adapté et une nouvelle acceptation est sollicitée lorsque la loi ou la nature de la modification l’exige.',
      ],
    },
    {
      titre: '20. Droit applicable et litiges',
      paragraphes: [
        'Les présentes conditions sont soumises au droit français, sous réserve des dispositions impératives protégeant les consommateurs.',
        'L’utilisateur peut adresser une réclamation à reminotta@breakeatapp.com afin que Break Eat examine la difficulté et, si nécessaire, coordonne avec la buvette.',
        'Le consommateur conserve le droit de saisir les juridictions compétentes. Les informations relatives à la médiation de la consommation sont mises à disposition lorsque la réglementation l’exige.',
      ],
    },
    {
      titre: '21. Langue et entrée en vigueur',
      paragraphes: [
        'Les présentes conditions sont rédigées en français. Elles entrent en vigueur à la date de leur publication dans l’application et sont accessibles avant leur acceptation.',
      ],
    },
  ],
};

const CGV: DocumentLegal = {
  cle: 'cgv',
  titre: 'Conditions générales de vente',
  resume: 'Ce qui s’applique à une commande : prix, paiement, retrait, remboursement.',
  version: VERSION,
  sections: [
    { titre: 'Éditeur', paragraphes: EDITEUR },
    {
      titre: '1. Objet',
      paragraphes: [
        'Les présentes conditions générales de vente encadrent les commandes de produits proposées dans l’application Break Eat App pour un événement et un point de retrait déterminés.',
        'Les conditions spécifiques présentées au client avant la validation de la commande les complètent.',
      ],
    },
    {
      titre: '2. Rôle de Break Eat App et du partenaire vendeur',
      paragraphes: [
        'Break Eat App fournit une solution technique permettant de consulter une offre, de passer une commande et de payer dans le parcours de l’application.',
        'Sauf indication contraire présentée avant l’achat, les produits sont vendus par la buvette ou l’établissement partenaire identifié dans l’offre et le récapitulatif de commande. Le partenaire détermine son offre, ses prix et ses disponibilités. Il est responsable de la préparation et de la remise des produits.',
      ],
    },
    {
      titre: '3. Informations sur les produits',
      paragraphes: [
        'Les descriptions, options, prix et disponibilités sont présentés dans l’application avant la commande. Les informations relatives aux produits sont fournies sous la responsabilité du partenaire vendeur.',
        'Le client est invité à vérifier les produits sélectionnés, les quantités, les options, le prix total, l’événement et le point de retrait avant de valider son achat.',
      ],
    },
    {
      titre: '4. Commande et confirmation',
      paragraphes: [
        'La commande devient définitive après sa validation par le client et la confirmation affichée dans l’application. Le client doit vérifier les informations figurant dans le récapitulatif.',
        'Une confirmation de commande est mise à sa disposition dans l’application ou transmise par voie électronique.',
      ],
    },
    {
      titre: '5. Prix',
      paragraphes: [
        'Les prix applicables sont ceux affichés dans l’application au moment de la validation de la commande. Le montant total est présenté au client avant le paiement.',
        'Toute taxe applicable est incluse ou indiquée conformément à la réglementation en vigueur.',
      ],
    },
    {
      titre: '6. Paiement',
      paragraphes: [
        'Le paiement est proposé directement dans le parcours de commande et traité par Stripe Connect. Break Eat App ne reçoit ni ne conserve aucune donnée de carte bancaire.',
        'Le paiement est encaissé par Break Eat App puis reversé au partenaire vendeur. Le traitement technique du paiement ne modifie pas, à lui seul, l’identité du vendeur des produits.',
      ],
    },
    {
      titre: '7. Reçu et facture',
      paragraphes: [
        'Après la commande, un reçu est mis à la disposition du client dans l’application.',
        'Lorsqu’une facture est délivrée, elle comporte les informations requises par la réglementation applicable et identifie le vendeur des produits.',
      ],
    },
    {
      titre: '8. Préparation et retrait',
      paragraphes: [
        'Les produits sont préparés et remis par le partenaire vendeur au point de retrait indiqué dans l’application. Break Eat App ne prépare pas les produits.',
        'Le client doit respecter les instructions de retrait communiquées lors de la commande et présenter, si nécessaire, sa confirmation ou son numéro de commande.',
      ],
    },
    {
      titre: '9. Disponibilité et incidents de commande',
      paragraphes: [
        'Si un produit devient indisponible ou si la commande ne peut pas être remise comme prévu, le client est informé dès que possible.',
        'Pour toute difficulté concernant la préparation, la qualité ou la remise des produits, le partenaire vendeur est l’interlocuteur responsable. Break Eat App facilite la transmission de la demande et intervient pour les difficultés relevant du fonctionnement technique de l’application.',
      ],
    },
    {
      titre: '10. Annulation et remboursement',
      paragraphes: [
        'Les possibilités d’annulation dépendent de l’état de préparation de la commande, de la nature des produits et des circonstances de l’événement, sous réserve des droits impératifs du consommateur.',
        'Si la commande ne peut pas être honorée, les sommes dues au client sont remboursées selon la réglementation applicable.',
        'Les demandes peuvent être adressées au partenaire vendeur ou à l’assistance Break Eat App, qui les oriente vers l’interlocuteur compétent.',
      ],
    },
    {
      titre: '11. Droit de rétractation',
      paragraphes: [
        'Le droit de rétractation peut être exclu dans les cas prévus par la loi, notamment pour les biens rapidement périssables et pour les prestations de restauration ou de loisirs fournies à une date ou à une période déterminée.',
        'Les exceptions applicables dépendent de la nature de la commande. Elles ne limitent pas les droits du client en cas de commande non exécutée ou de non-conformité.',
      ],
    },
    {
      titre: '12. Réclamations',
      paragraphes: [
        'Pour toute réclamation relative aux produits, à leur préparation, à leur qualité ou à leur remise, le client peut contacter le partenaire vendeur identifié dans l’offre ou le récapitulatif de commande.',
        'Pour les difficultés liées au fonctionnement technique de l’application : reminotta@breakeatapp.com ou 06 46 69 56 75.',
      ],
    },
    {
      titre: '13. Médiation de la consommation',
      paragraphes: [
        'Pour les litiges relevant de la vente des produits, le client peut recourir gratuitement au médiateur de la consommation dont relève le partenaire vendeur, dans les conditions légales applicables et après avoir adressé une réclamation écrite préalable au professionnel concerné.',
        'Les coordonnées du médiateur compétent sont communiquées par le professionnel concerné conformément à ses obligations légales.',
      ],
    },
    {
      titre: '14. Responsabilité du partenaire vendeur',
      paragraphes: [
        'Le partenaire vendeur est responsable de la préparation, de la conformité, de la qualité, de la sécurité et de la remise des produits, ainsi que des informations qu’il doit légalement fournir.',
        'Les présentes conditions ne limitent pas les droits impératifs dont bénéficie le consommateur.',
      ],
    },
    {
      titre: '15. Fonctionnement de l’application',
      paragraphes: [
        'Break Eat App met en œuvre des moyens raisonnables pour assurer le fonctionnement de son application. Des opérations de maintenance, des problèmes de réseau ou des incidents indépendants de sa volonté peuvent temporairement affecter le service.',
        'Cette disposition ne limite pas la responsabilité de Break Eat App pour ses propres manquements ni les droits légaux du client.',
      ],
    },
    {
      titre: '16. Données personnelles',
      paragraphes: [
        'Les données personnelles sont traitées conformément à la politique de confidentialité accessible depuis cet écran.',
        'Les informations nécessaires à la préparation, à la remise de la commande et au traitement des réclamations sont communiquées au partenaire vendeur dans la mesure nécessaire à ces finalités.',
      ],
    },
    {
      titre: '17. Propriété intellectuelle',
      paragraphes: [
        'L’application, ses interfaces, ses éléments graphiques, ses marques et ses logiciels sont protégés par les droits de propriété intellectuelle applicables.',
        'Le client bénéficie d’un droit personnel et non exclusif d’utiliser l’application pour ses besoins de commande. Aucun droit de propriété intellectuelle n’est transféré au client.',
      ],
    },
    {
      titre: '18. Événement annulé ou modifié',
      paragraphes: [
        'Si un événement est annulé, interrompu ou modifié et que la commande ne peut pas être honorée, le client est informé dès que possible.',
        'Les modalités de traitement de la commande et de remboursement sont déterminées selon les circonstances et la réglementation applicable.',
      ],
    },
    {
      titre: '19. Utilisation de l’application',
      paragraphes: [
        'Le client s’engage à fournir des informations exactes et à utiliser l’application conformément à sa destination. Il ne doit pas tenter de compromettre sa sécurité ou son fonctionnement.',
        'En cas d’utilisation frauduleuse ou abusive, les mesures nécessaires et proportionnées peuvent être prises dans le respect de la réglementation applicable.',
      ],
    },
    {
      titre: '20. Règlement des litiges et droit applicable',
      paragraphes: [
        'Les présentes conditions sont soumises au droit français, sans priver le consommateur des dispositions impératives qui lui sont applicables.',
        'En cas de difficulté, le client est invité à contacter le professionnel concerné afin de rechercher une solution amiable, sans préjudice de son droit de saisir les juridictions compétentes ou, le cas échéant, un médiateur de la consommation.',
      ],
    },
    {
      titre: '21. Modification des conditions',
      paragraphes: [
        'Les présentes conditions peuvent être mises à jour pour tenir compte de l’évolution de l’application, des offres ou de la réglementation.',
        'La version applicable à la commande est celle présentée au client au moment de sa validation.',
      ],
    },
    {
      titre: '22. Contact',
      paragraphes: [
        'Pour les questions relatives au fonctionnement technique de la plateforme : BREAK EAT APP, 91 allée des Chardonnerets, 13013 Marseille, France ; reminotta@breakeatapp.com ; 06 46 69 56 75.',
        'Pour les questions relatives aux produits, à leur préparation ou à leur remise : contacter le partenaire vendeur indiqué dans l’offre ou le récapitulatif de commande.',
      ],
    },
  ],
};

/**
 * L'ORDRE D'AFFICHAGE, et il n'est pas alphabétique.
 *
 * La confidentialité d'abord : c'est le document qu'on vient chercher, celui
 * qu'Apple vérifie, et celui qui répond à « qu'est-ce que vous faites de mes
 * données ». Les mentions légales ferment la marche — on les consulte quand
 * on cherche qui est derrière l'application, bien plus rarement.
 */
export const DOCUMENTS_LEGAUX: readonly DocumentLegal[] = [
  CONFIDENTIALITE,
  CGU,
  CGV,
  MENTIONS,
];

export const documentParCle = (cle: CleDocument): DocumentLegal | undefined =>
  DOCUMENTS_LEGAUX.find((d) => d.cle === cle);
