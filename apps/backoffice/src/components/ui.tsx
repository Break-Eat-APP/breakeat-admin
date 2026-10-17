'use client';

import React from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { BRAND } from '@break-eat/brand';

/**
 * LE GABARIT DU BACK-OFFICE.
 *
 * Avant : chaque écran réinventait son titre, ses cartes et ses boutons en
 * style en ligne. Résultat, six pages qui se ressemblent vaguement — et une
 * correction de design à faire six fois.
 *
 * Direction reprise de FlaiX Expert, transposée en orange Break Eat :
 *
 *  · un CANEVAS teinté, pour que les cartes blanches se détachent. C'est ce
 *    contraste doux qui fait respirer un écran dense ; du blanc sur du blanc
 *    donne une page plate, qu'on lit comme un document et non comme un outil ;
 *  · tout vit dans des CARTES à coin franc (16 px) et ombre presque invisible ;
 *  · chaque carte de navigation porte un CARRÉ D'ICÔNE teinté, un titre, une
 *    phrase, et une LIGNE D'ÉTAT colorée en bas — on sait où on en est sans
 *    ouvrir ;
 *  · les boutons et les onglets sont des PILULES. Jamais d'angle droit sur un
 *    élément cliquable.
 *
 * Tout est ici, et nulle part ailleurs : changer un rayon ou une ombre se fait
 * à un seul endroit.
 */

/** Le canevas teinté d'une page, et sa largeur de lecture. */
export function Page({
  children,
  large,
}: {
  children: React.ReactNode;
  /** Les écrans à tableaux ont besoin de toute la largeur. */
  large?: boolean;
}) {
  return (
    <div style={{ padding: '30px 36px 56px', maxWidth: large ? 1500 : 1180 }}>{children}</div>
  );
}

/**
 * L'en-tête d'une page : un titre net, UNE phrase, et l'action principale.
 *
 * La phrase n'est pas décorative — elle dit à quoi sert l'écran. Un
 * super-admin ouvre six écrans qui manipulent les mêmes objets ; sans cette
 * ligne, il faut lire le contenu pour savoir où l'on est.
 */
export function PageHeader({
  titre,
  sous,
  retour,
  action,
}: {
  titre: string;
  sous?: string;
  /** Fil d'Ariane vers l'écran parent. */
  retour?: { href: string; libelle: string };
  action?: React.ReactNode;
}) {
  return (
    <header style={{ marginBottom: 24 }}>
      {retour ? (
        <Link
          href={retour.href}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            color: BRAND.grey,
            fontSize: 13.5,
            textDecoration: 'none',
            marginBottom: 8,
          }}
        >
          ‹ {retour.libelle}
        </Link>
      ) : null}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 20,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1
            style={{
              fontFamily: BRAND.fontDisplay,
              fontSize: 30,
              fontWeight: 800,
              color: BRAND.ink,
              margin: 0,
              letterSpacing: -0.6,
            }}
          >
            {titre}
          </h1>
          {sous ? (
            <p
              style={{
                // Raleway aussi sur les phrases : demandé le 17/10 pour une
                // écriture plus moderne. Elle reste lisible à cette taille, et
                // donne au texte le même ton qu'aux titres.
                fontFamily: BRAND.fontDisplay,
                fontSize: 14.5,
                color: BRAND.grey,
                margin: '7px 0 0',
                lineHeight: 1.5,
                maxWidth: 680,
              }}
            >
              {sous}
            </p>
          ) : null}
        </div>
        {action}
      </div>
    </header>
  );
}

/** Une carte blanche — le contenant de base de tout l'écran. */
export function Carte({
  children,
  style,
  plat,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  /** Sans ombre : pour une carte posée DANS une autre. */
  plat?: boolean;
}) {
  return (
    <section
      style={{
        background: BRAND.surface,
        border: `1px solid ${BRAND.border}`,
        borderRadius: BRAND.radius.card,
        boxShadow: plat ? 'none' : BRAND.shadowCard,
        padding: 22,
        ...style,
      }}
    >
      {children}
    </section>
  );
}

/** Le titre d'une carte, avec sa phrase d'explication. */
export function TitreCarte({ titre, sous }: { titre: string; sous?: string }) {
  return (
    <div style={{ marginBottom: sous ? 16 : 14 }}>
      <h2
        style={{
          fontFamily: BRAND.fontDisplay,
          fontSize: 17.5,
          fontWeight: 700,
          color: BRAND.ink,
          margin: 0,
          letterSpacing: -0.2,
        }}
      >
        {titre}
      </h2>
      {sous ? (
        <p
          style={{
            fontFamily: BRAND.fontDisplay,
            fontSize: 13.5,
            color: BRAND.grey,
            margin: '5px 0 0',
            lineHeight: 1.55,
          }}
        >
          {sous}
        </p>
      ) : null}
    </div>
  );
}

/** Une grille de cartes qui se replie toute seule. */
export function Grille({
  children,
  min = 272,
}: {
  children: React.ReactNode;
  min?: number;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`,
        gap: 16,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Le carré d'icône teinté.
 *
 * Il donne à chaque carte un point d'entrée visuel : sur une grille de douze,
 * on retrouve une destination à sa forme avant d'avoir lu son titre.
 */
export function CarreIcone({ icone: Icone, taille = 42 }: { icone: LucideIcon; taille?: number }) {
  return (
    <div
      style={{
        width: taille,
        height: taille,
        borderRadius: 13,
        background: BRAND.orangeTint,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <Icone size={Math.round(taille * 0.46)} strokeWidth={1.9} color={BRAND.orange} />
    </div>
  );
}

/**
 * Une carte de DESTINATION : icône, titre, phrase, et l'état en bas.
 *
 * C'est la brique de l'accueil. La ligne d'état est ce qui la rend utile —
 * « 3 clubs · 12 comptes » répond à la question avant qu'on ait cliqué.
 */
export function CarteLien({
  href,
  icone,
  titre,
  description,
  etat,
}: {
  href: string;
  icone: LucideIcon;
  titre: string;
  description: string;
  etat?: string;
}) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div
        style={{
          background: BRAND.surface,
          border: `1px solid ${BRAND.border}`,
          borderRadius: BRAND.radius.card,
          boxShadow: BRAND.shadowCard,
          padding: 20,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          transition: 'border-color 0.14s, box-shadow 0.14s, transform 0.14s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = BRAND.orange;
          e.currentTarget.style.boxShadow = BRAND.shadowSoft;
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = BRAND.border;
          e.currentTarget.style.boxShadow = BRAND.shadowCard;
          e.currentTarget.style.transform = 'none';
        }}
      >
        <CarreIcone icone={icone} />
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontFamily: BRAND.fontDisplay,
              fontSize: 16.5,
              fontWeight: 700,
              color: BRAND.ink,
              letterSpacing: -0.2,
            }}
          >
            {titre}
          </div>
          <p
            style={{
              fontFamily: BRAND.fontDisplay,
              fontSize: 13.5,
              color: BRAND.grey,
              margin: '6px 0 0',
              lineHeight: 1.55,
            }}
          >
            {description}
          </p>
        </div>
        {etat ? (
          <div
            style={{ fontFamily: BRAND.fontDisplay, fontSize: 13, fontWeight: 700, color: BRAND.orange }}
          >
            {etat}
          </div>
        ) : null}
      </div>
    </Link>
  );
}

/** Le titre d'un groupe de cartes — la structure se voit avant d'être lue. */
export function TitreSection({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ ...BRAND.sectionTitle, margin: '30px 0 13px' } as React.CSSProperties}>
      {children}
    </h2>
  );
}

/** Un chiffre qui compte, dans sa carte. */
export function Kpi({
  libelle,
  valeur,
  indice,
  accent,
}: {
  libelle: string;
  valeur: string;
  indice?: string;
  accent?: boolean;
}) {
  return (
    <Carte style={{ padding: 18 }}>
      <div style={{ fontSize: 12.5, color: BRAND.grey, fontWeight: 600 }}>{libelle}</div>
      <div
        style={{
          fontFamily: BRAND.fontDisplay,
          fontSize: 27,
          fontWeight: 800,
          color: accent ? BRAND.orange : BRAND.ink,
          marginTop: 7,
          letterSpacing: -0.6,
        }}
      >
        {valeur}
      </div>
      {indice ? (
        <div style={{ fontSize: 12, color: BRAND.grey, marginTop: 5 }}>{indice}</div>
      ) : null}
    </Carte>
  );
}

/** Une pastille d'état — courte, colorée, jamais une phrase. */
export function Chip({
  children,
  ton = 'neutre',
}: {
  children: React.ReactNode;
  ton?: 'neutre' | 'succes' | 'alerte' | 'danger' | 'marque';
}) {
  const tons = {
    neutre: { bg: BRAND.bgSubtle, fg: BRAND.inkSoft },
    succes: { bg: BRAND.successBg, fg: BRAND.success },
    alerte: { bg: BRAND.warningBg, fg: BRAND.warning },
    danger: { bg: BRAND.dangerBg, fg: BRAND.danger },
    marque: { bg: BRAND.orangeTint, fg: BRAND.orange },
  }[ton];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: tons.bg,
        color: tons.fg,
        borderRadius: BRAND.radius.pill,
        padding: '4px 11px',
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

/** Un bouton en pilule. Jamais d'angle droit sur ce qui se clique. */
export function Bouton({
  children,
  onClick,
  variante = 'principal',
  disabled,
  type = 'button',
  style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variante?: 'principal' | 'discret' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit';
  style?: React.CSSProperties;
}) {
  const v = {
    principal: { bg: BRAND.orange, fg: '#fff', bd: BRAND.orange },
    discret: { bg: '#fff', fg: BRAND.inkSoft, bd: BRAND.border },
    danger: { bg: '#fff', fg: BRAND.danger, bd: BRAND.dangerBg },
  }[variante];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: v.bg,
        color: v.fg,
        border: `1px solid ${v.bd}`,
        borderRadius: BRAND.radius.pill,
        padding: '10px 20px',
        fontSize: 13.5,
        fontWeight: 700,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: 'inherit',
        transition: 'opacity 0.12s, box-shadow 0.12s',
        ...style,
      }}
    >
      {children}
    </button>
  );
}
