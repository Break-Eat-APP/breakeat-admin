import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { UpdateEventDto } from './update-event.dto';

/**
 * LE NOM D'UN ÉVÉNEMENT, DERRIÈRE LE VRAI PIPE DE VALIDATION.
 *
 * Le renommage passe par l'admin, et ce que ce pipe rejette remonte MOT POUR
 * MOT sous le champ. Deux choses doivent donc tenir ensemble :
 *  · le nom est nettoyé AVANT d'être mesuré — sinon « ␣␣ » passe la longueur
 *    minimale et l'app affiche un match sans titre ;
 *  · le refus est en français — sinon le club lit « name must be longer than
 *    or equal to 2 characters », le défaut même qu'on a corrigé sur les dates.
 *
 * Testé au niveau du pipe et pas du service : le `@Transform` n'existe pas
 * pour un appel direct au service, il ne vit que dans ce chemin-là.
 */
describe('UpdateEventDto — le nom (pipe de validation réel)', () => {
  // Mêmes options que main.ts — toute divergence rendrait ce test décoratif.
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const meta = { type: 'body' as const, metatype: UpdateEventDto };

  async function refus(corps: unknown): Promise<string[]> {
    try {
      await pipe.transform(corps, meta);
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      const r = (e as BadRequestException).getResponse() as { message: string[] };
      return r.message;
    }
    throw new Error('le pipe aurait dû refuser');
  }

  it('retire les espaces autour du nom', async () => {
    const dto = (await pipe.transform({ name: '  Marseille vs Lens  ' }, meta)) as UpdateEventDto;
    expect(dto.name).toBe('Marseille vs Lens');
  });

  it('refuse un nom fait d’espaces, en français', async () => {
    expect(await refus({ name: '    ' })).toEqual([
      'Le nom de l’événement doit faire au moins 2 caractères.',
    ]);
  });

  it('refuse un nom trop long, en français', async () => {
    expect(await refus({ name: 'x'.repeat(151) })).toEqual([
      'Le nom de l’événement ne peut pas dépasser 150 caractères.',
    ]);
  });

  it('laisse le nom de côté quand on ne l’envoie pas', async () => {
    const dto = (await pipe.transform({ visibility: 'PUBLIC' }, meta)) as UpdateEventDto;
    expect(dto.name).toBeUndefined();
  });
});
