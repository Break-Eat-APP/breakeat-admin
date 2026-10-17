'use client';

import { use } from 'react';
import { notFound } from 'next/navigation';
import { BRAND } from '@/lib/brand';
import { groupeParSlug } from '@/lib/nav';
import { CarreIcone, Grille, Page, PageHeader } from '@/components/ui';

/**
 * LA PAGE D'ATTERRISSAGE D'UNE SECTION.
 *
 * Cliquer un titre de section n'ouvre pas un écran de configuration : il ouvre
 * la LISTE DES MODULES de cette section, chacun avec une phrase qui dit ce
 * qu'on y fait. On choisit alors en connaissance de cause.
 *
 * Pourquoi cette étape, alors que le menu mène déjà partout : un libellé de
 * menu dit OÙ l'on va, jamais ce qu'on y trouve. « Encaissement » ne répond pas
 * à « c'est là que je mets mon RIB ? ». Qui connaît son chemin clique
 * directement dans le menu et ne passe jamais ici ; qui cherche atterrit sur
 * une page qui explique. Les deux publics sont servis, sans se gêner.
 *
 * Une SEULE route pour toutes les sections (`/section/[slug]`), alimentée par
 * les mêmes données que le menu (`lib/nav.ts`) : six pages écrites à la main
 * finiraient par diverger du menu, et c'est précisément ce qu'on veut éviter.
 */
export default function SectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const groupe = groupeParSlug(slug);
  if (!groupe) notFound();

  return (
    <Page>
      <PageHeader titre={groupe.title} sous={groupe.sous} />

      <Grille>
        {groupe.items.map((item) => (
          <a
            key={item.href}
            href={item.href}
            target={item.external ? '_blank' : undefined}
            rel={item.external ? 'noopener noreferrer' : undefined}
            style={{ textDecoration: 'none' }}
          >
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
              <CarreIcone icone={item.icon} />
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
                  {item.label}
                </div>
                <p
                  style={{ fontSize: 13, color: BRAND.grey, margin: '6px 0 0', lineHeight: 1.5 }}
                >
                  {item.description}
                </p>
              </div>
              {/* Un lien qui SORT de la console se signale : on ne découvre pas
                  qu'on a changé de site une fois qu'on y est. */}
              {item.external ? (
                <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.orange }}>
                  Ouvre chez Flaix ↗
                </div>
              ) : (
                <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.orange }}>Ouvrir</div>
              )}
            </div>
          </a>
        ))}
      </Grille>
    </Page>
  );
}
