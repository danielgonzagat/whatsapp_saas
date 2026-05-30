import { ProductService } from '../../../products/product.service';
import { KloelDomainServiceResolver } from '../../domain-service-resolver.service';
import { CAPABILITY_MAP } from '../capability-registry-v2.const';

describe('DEBUG token map', () => {
  it('logs SERVICE_TOKEN_MAP ProductService entry', () => {
    const map = (
      KloelDomainServiceResolver as unknown as {
        SERVICE_TOKEN_MAP: Map<string, unknown>;
      }
    ).SERVICE_TOKEN_MAP;
    // eslint-disable-next-line no-console
    console.log('PRODUCT_SERVICE_IMPORTED_TYPE', typeof ProductService, ProductService?.name);
    // eslint-disable-next-line no-console
    console.log('TOKEN_MAP_HAS_PRODUCTSERVICE', map.has('ProductService'));
    // eslint-disable-next-line no-console
    console.log('TOKEN_MAP_GET_PRODUCTSERVICE', map.get('ProductService'));
    // eslint-disable-next-line no-console
    console.log(
      'TOKEN_MAP_GET_PRODUCTSERVICE_TYPE',
      typeof map.get('ProductService'),
      (map.get('ProductService') as { name?: string })?.name,
    );
    // eslint-disable-next-line no-console
    console.log('SAME_REF', map.get('ProductService') === ProductService);
    // eslint-disable-next-line no-console
    console.log('CAP_DOMAINSERVICE', CAPABILITY_MAP.get('products.set_sales_page')?.domainService);
    expect(true).toBe(true);
  });
});
