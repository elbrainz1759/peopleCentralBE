import { CountriesController } from './countries.controller';

describe('CountriesController', () => {
  let controller: CountriesController;
  const mockService: any = {};

  beforeEach(() => {
    controller = new CountriesController(mockService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
