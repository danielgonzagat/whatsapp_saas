export { EmailDispatchAdapter } from './email-dispatch.adapter';
export { TransactionalEmailDispatchAdapter } from './transactional-email-dispatch.adapter';
export { isEmailRoutingFacadeEnabled } from './email-routing-facade.flag';
export {
  EMAIL_CLASS_TO_CHANNEL_KIND,
  resolveEmailChannelKind,
  routeEmail,
  type EmailMessageClass,
  type EmailRouteRequest,
} from './email-routing';
