import { SetMetadata } from '@nestjs/common';

/** Public route metadata. */
export const IS_PUBLIC_METADATA = 'isPublic';
/** Public. */
export const Public = () => SetMetadata(IS_PUBLIC_METADATA, true);
