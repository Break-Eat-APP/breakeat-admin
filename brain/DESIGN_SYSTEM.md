# BRAT EAT Design System

Version: V1 source of truth

## UX Direction

The product must feel:

- premium;
- instant;
- fluid;
- operationally reliable;
- modern without visual noise.

Reference feel:

- Uber Eats for ordering clarity;
- Burger King for mobile simplicity;
- Apple for smoothness and polish;
- operations dashboards for density and speed.

## Mobile UX Principles

- Mobile-first.
- Fast checkout.
- Sticky cart.
- Skeleton loading.
- Smooth navigation.
- Clear pickup timing.
- Strong order status feedback.
- Smart event switching.
- Favorites and reorder when enabled.

## Operator UX Principles

Operator dashboards are work tools, not marketing pages.

During rush, the UI must:

- reduce distractions;
- use large interaction targets;
- make order status obvious;
- support fullscreen kiosk mode;
- keep realtime status visible;
- surface recovered orders clearly;
- avoid decorative complexity.

## Mandatory Components

- Button
- ProductCard
- DashboardOrderCard
- Modal
- BottomSheet
- NotificationBanner
- SlotSelector
- Timeline
- SkeletonLoader
- StatusBadge
- RealtimeIndicator
- StickyCart
- EmptyState
- ErrorState

## Visual Rules

- Prefer clarity over decoration.
- Use restrained color.
- Avoid heavy animation during rush.
- Do not hide critical actions behind complex gestures.
- Loading states must be immediate.
- Critical states need strong contrast.
- Public screens must be readable from distance.

## Dashboard Status Language

Use consistent labels:

- New
- Accepted
- Preparing
- Ready
- Picked up
- Recovered
- Cancelled

## Public Screen Privacy

Public screens may show:

- public order number;
- preparation status;
- ready status;
- pickup point;
- grouped product summaries when needed.

Public screens must not show:

- customer full name;
- phone;
- email;
- payment details;
- private notes.

