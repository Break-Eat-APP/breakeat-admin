import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { FlagScope } from '@prisma/client';
import { SetAppSettingDto } from './set-app-setting.dto';

/**
 * Ce test rejoue le pipe de validation RÉEL, avec les options de `main.ts`.
 *
 * Pourquoi il existe : `whitelist` + `forbidNonWhitelisted` suppriment puis
 * rejettent toute propriété qui ne porte aucun décorateur de validation. Un
 * champ volontairement libre — ici la valeur d'un réglage, qui peut être
 * n'importe quel JSON — a donc besoin d'un `@Allow()` explicite. Sans lui, la
 * requête échoue sur « property value should not exist », c'est-à-dire sur le
 * seul champ que cet endpoint sert à transporter.
 *
 * Le piège est silencieux : le code compile, les tests de service passent, et
 * la panne n'apparaît qu'à l'exécution derrière le pipe global. D'où ce test
 * au niveau du DTO plutôt qu'au niveau du service.
 */
describe('SetAppSettingDto (pipe de validation réel)', () => {
  // Mêmes options que main.ts — toute divergence rendrait ce test décoratif.
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const meta = { type: 'body' as const, metatype: SetAppSettingDto };

  const base = { key: 'notifications.preferences', scope: FlagScope.ORGANIZATION };
  const ORG_ID = '46c82b94-7538-483c-b14a-7c5ab8ddeb69';

  it('accepte un objet — le cas du wizard « préférences de notifications »', async () => {
    const body = { ...base, scopeId: ORG_ID, value: { orderReady: true, rush: false } };

    await expect(pipe.transform(body, meta)).resolves.toMatchObject({
      value: { orderReady: true, rush: false },
    });
  });

  it.each([
    ['une chaîne', 'bonjour'],
    ['un nombre', 42],
    ['un booléen', true],
    ['un tableau', ['a', 'b']],
    ['null', null],
  ])('accepte %s comme valeur', async (_libelle, value) => {
    const result = (await pipe.transform(
      { ...base, scopeId: ORG_ID, value },
      meta,
    )) as SetAppSettingDto;

    // Le point crucial : la valeur SURVIT au whitelisting.
    expect(result.value).toEqual(value);
  });

  it('rejette toujours une propriété réellement inconnue', async () => {
    const body = { ...base, scopeId: ORG_ID, value: 1, inconnu: 'x' };

    // `@Allow()` ouvre la porte au seul champ `value`, pas au reste : la
    // protection contre les champs parasites doit rester en place.
    await expect(pipe.transform(body, meta)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejette un scope inconnu', async () => {
    const body = { key: 'x', scope: 'PLANETE', value: 1 };

    await expect(pipe.transform(body, meta)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejette un scopeId qui n’est pas un UUID', async () => {
    const body = { ...base, scopeId: 'pas-un-uuid', value: 1 };

    await expect(pipe.transform(body, meta)).rejects.toBeInstanceOf(BadRequestException);
  });
});
