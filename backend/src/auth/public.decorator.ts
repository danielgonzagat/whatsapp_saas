import { SetMetadata } from '@nestjs/common';

/** Is_public_key. */
export const IS_PUBLIC_KEY = 'isPublic';
/** Public. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
