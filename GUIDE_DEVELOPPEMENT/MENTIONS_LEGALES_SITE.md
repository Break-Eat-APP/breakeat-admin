# Mentions légales — texte à coller sur le site Wix

> **À quoi sert ce fichier.** Le site et l'application doivent dire la même
> chose : deux versions qui divergent, c'est celle qu'on a oublié de corriger
> qui fera foi contre nous. Le texte ci-dessous est aligné mot pour mot sur
> `apps/mobile/src/lib/textes-legaux.ts`. **Quand l'un change, l'autre change.**
>
> Dernière mise à jour : 23 octobre 2026.

---

## ⚠️ Ce qu'il remplace, et pourquoi

Les mentions actuellement en ligne contiennent trois erreurs :

| Ce qui est écrit | Le problème |
|---|---|
| « Nom de l'hébergeur : Break Eat App — 91 allée des chardonnerets, Marseille » | **Faux.** Le site est servi par Wix (vérifié sur les en-têtes HTTP). L'article 6 III de la LCEN impose de nommer l'hébergeur réel. Au passage, cela publie une adresse personnelle en la présentant comme un centre de données. |
| « Raison sociale : NOTTA LLC — SIRET : L23000054900 » | La société qui **vend et encaisse** est BREAK EAT APP (SAS française). Et `L23000054900` n'est pas un SIRET : un SIRET fait 14 chiffres. |
| « Dernière mise à jour : 01/01/2024 » | Antérieure à la création de la SAS (2 avril 2024). La page n'a jamais été reprise depuis. |

---

## Texte à coller

### MENTIONS LÉGALES

*Version du 23 octobre 2026*

#### 1. Éditeur du site et de l'application

Le site internet `breakeatapp.com` et l'application mobile Break Eat sont
édités par :

**BREAK EAT APP**, nom commercial **BREAK EAT**, société par actions
simplifiée (SAS) de droit français.

- Siège social : 91 allée des Chardonnerets, 13013 Marseille, France
- SIREN : 925 187 395 — RCS Marseille 925 187 395
- Capital social : 1 000 €
- TVA intracommunautaire : FR26925187395
- E-mail : reminotta@breakeatapp.com
- Téléphone : 06 46 69 56 75

**Distribution de l'application.** L'application est publiée sur l'App Store
d'Apple par **Notta LLC**, titulaire du compte développeur — c'est le nom qui
apparaît sur la fiche de l'application. L'exploitation du service, la vente,
l'encaissement et le traitement des données personnelles relèvent de
BREAK EAT APP, société française désignée ci-dessus.

#### 2. Directeur de la publication

Rémi Notta, en sa qualité de Président de la société BREAK EAT APP.

#### 3. Hébergement

**Le site internet** `breakeatapp.com` est hébergé par **Wix.com Ltd**,
40 Namal Tel Aviv St., Tel Aviv 6350671, Israël — https://www.wix.com

**Le serveur de l'application et sa base de données** sont hébergés par
**Railway Corporation**, 548 Market St, PMB 68956, San Francisco, CA 94104,
États-Unis — téléphone : +1 415 707 7675, https://railway.com

#### 4. Présentation du service

Break Eat est une solution de commande en ligne destinée aux spectateurs
d'événements sportifs et aux visiteurs de lieux événementiels. Elle permet de
consulter les produits proposés par des points de vente partenaires, de passer
commande, de payer en ligne et de récupérer la commande auprès du point de
vente concerné.

#### 5. Rôle de la plateforme, vendeurs et paiements

Les produits proposés sont vendus par les buvettes partenaires. Ces
établissements sont responsables des produits qu'ils proposent, de leur
préparation et de leur remise au client.

Le paiement en ligne est traité au moyen de Stripe Connect. Break Eat App ne
conserve aucune donnée de carte bancaire : elles sont saisies dans le parcours
du prestataire de paiement et ne transitent pas par nos serveurs.

Les présentes mentions légales ne remplacent ni les conditions générales
d'utilisation, ni les conditions générales de vente applicables à chaque
commande.

#### 6. Propriété intellectuelle

La dénomination Break Eat App, la marque Break Eat, les éléments graphiques,
les logos, les interfaces, les textes, les logiciels et les autres contenus
propres à la plateforme sont protégés par les règles applicables en matière de
propriété intellectuelle, sous réserve des droits détenus par des tiers.

Toute reproduction, représentation, adaptation ou exploitation non autorisée de
ces éléments est interdite, sauf autorisation préalable du titulaire des droits
ou exception prévue par la loi.

Les marques, logos, photographies et contenus appartenant aux établissements
partenaires ou à d'autres tiers demeurent la propriété de leurs titulaires
respectifs.

#### 7. Données personnelles

L'utilisation du service entraîne le traitement de données à caractère
personnel. Les finalités, les bases légales, les destinataires, les durées de
conservation, les transferts éventuels hors de l'Espace économique européen et
les droits des personnes sont détaillés dans la **politique de
confidentialité**.

Les données sont collectées, hébergées et traitées sous la responsabilité de
BREAK EAT APP, en France.

Pour toute question : reminotta@breakeatapp.com

#### 8. Conditions d'utilisation et de commande

- **Conditions générales d'utilisation (CGU)** — [lien à poser]
- **Conditions générales de vente (CGV)** — [lien à poser]
- **Politique de confidentialité** — [lien à poser]

#### 9. Contact

BREAK EAT APP — BREAK EAT
91 allée des Chardonnerets, 13013 Marseille, France
E-mail : reminotta@breakeatapp.com — Téléphone : 06 46 69 56 75

---

## Ce qu'il reste à faire sur le site

1. **Publier les trois autres documents** (confidentialité, CGU, CGV) en pages
   Wix, et poser leurs liens au § 8. Le texte est dans
   `apps/mobile/src/lib/textes-legaux.ts` — **à recopier tel quel**.
2. **Donner l'adresse de la politique de confidentialité à App Store Connect.**
   Apple réclame une URL publique, pas un écran d'application. C'est la seule
   de ces pages dont Apple a besoin pour accepter la publication.
3. **Confirmer l'entité Wix.** Pour un client européen, l'entité contractante
   peut être Wix.com Luxembourg S.à r.l. plutôt que la maison mère
   israélienne. C'est écrit dans les conditions du compte Wix. L'adresse
   ci-dessus est celle du siège du groupe, documentée publiquement, mais elle
   n'a pas été confirmée sur le contrat.
