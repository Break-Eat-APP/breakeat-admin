import { IsString, Matches } from 'class-validator';

/**
 * Validated room name sent by clients on `join_room` / `leave_room` events.
 *
 * Allowed prefixes (from REALTIME_CONTRACTS.md):
 *   organization:{uuid}  |  event:{uuid}  |  supplier:{uuid}
 *   pickup-point:{uuid}  |  order:{uuid}  |  dashboard:{uuid}
 */
const ROOM_PATTERN =
  /^(organization|event|supplier|pickup-point|order|dashboard):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class JoinRoomDto {
  @IsString()
  @Matches(ROOM_PATTERN, {
    message:
      'room must match pattern: <type>:<uuid> where type is organization|event|supplier|pickup-point|order|dashboard',
  })
  room!: string;
}
