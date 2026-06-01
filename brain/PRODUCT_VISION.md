# BRAT EAT Product Vision

Version: V1 source of truth
Generated: 2026-05-25

## Positioning

BRAT EAT is a realtime click-and-collect platform for stadiums, arenas, festivals, corporate campuses and event venues.

It is not a classic food ordering app. It is an operational ordering system designed to reduce waiting time, protect venue flow during rush periods and create a premium mobile ordering experience.

## Core Promise

Users must feel:

- ordering is fast;
- pickup timing is clear;
- the venue feels modern;
- the app understands operational pressure;
- the order will not be lost.

## Primary KPI

Zero lost orders during real rush periods.

All architecture, UX and infrastructure decisions must protect this KPI.

## Product Pillars

1. Speed
2. Realtime synchronization
3. Operational reliability
4. Premium mobile experience
5. Intelligent rush management through Flaix

## Strategic Differentiator

Flaix is the strategic moat. It orchestrates pickup slots, rush scoring, queue pressure, throttling, pacing and operational recommendations.

BRAT EAT must never override a Flaix decision. It can request, display and apply Flaix decisions, but Flaix remains the source of truth for rush and slot orchestration.

## V1 Scope

V1 must stay simple, stable and production-ready.

### V1 Includes

- mobile click-and-collect;
- basic account creation and login;
- organizations, venues and events;
- suppliers and pickup points;
- products, categories and realtime availability;
- cart and Stripe checkout;
- order lifecycle with traceable transitions;
- pickup slot selection;
- operator dashboard;
- public ready screen;
- realtime notifications and dashboard updates;
- basic feature flags;
- basic monitoring and error tracking.

### V1 Deferred

- microservices;
- advanced fraud engine;
- advanced accounting;
- advanced RGPD automation;
- complex split-kitchen orchestration;
- advanced page builder;
- full loyalty automation;
- advanced predictive analytics;
- advanced corporate SSO;
- multi-region deployment.

## Non-Negotiable Rules

- Never lose an order.
- Never break realtime order flow.
- Never block operator dashboards during rush.
- Never generate the full app in one request.
- Work module by module.
- Keep V1 simple and stable.
- Prefer robust business flows over visual complexity.
- Every important action must be traceable.
- Every order transition must be persisted.
- Every critical module must support feature flags.

