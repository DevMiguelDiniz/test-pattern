import { CheckoutService } from '../src/services/CheckoutService.js';
import { Pedido } from '../src/domain/Pedido.js';
import { Item } from '../src/domain/Item.js';
import { UserMother } from './builders/UserMother.js';
import { CarrinhoBuilder } from './builders/CarrinhoBuilder.js';

const CARTAO = '4111-1111-1111-1111';

describe('CheckoutService', () => {
  describe('quando o pagamento falha', () => {
    let gatewayStub, repositoryDummy, emailDummy, checkoutService;

    beforeEach(() => {
      // Arrange
      gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: false }) };
      repositoryDummy = { salvar: jest.fn() };
      emailDummy = { enviarEmail: jest.fn() };
      checkoutService = new CheckoutService(gatewayStub, repositoryDummy, emailDummy);
    });

    it('deve retornar null (verificação de estado)', async () => {
      const carrinho = new CarrinhoBuilder().build();

      // Act
      const pedido = await checkoutService.processarPedido(carrinho, CARTAO);

      // Assert
      expect(pedido).toBeNull();
    });

    it('não deve salvar o pedido nem enviar e-mail', async () => {
      const carrinho = new CarrinhoBuilder().build();

      await checkoutService.processarPedido(carrinho, CARTAO);

      expect(repositoryDummy.salvar).not.toHaveBeenCalled();
      expect(emailDummy.enviarEmail).not.toHaveBeenCalled();
    });
  });

  describe('quando um cliente padrão finaliza a compra', () => {
    it('deve retornar o pedido salvo com o totalFinal sem desconto', async () => {
      // Arrange
      const carrinho = new CarrinhoBuilder()
        .comUser(UserMother.umUsuarioPadrao())
        .comItens([new Item('Teclado', 150), new Item('Mouse', 50)])
        .build();
      const pedidoSalvo = new Pedido(10, carrinho, 200, 'PROCESSADO');
      const gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
      const repositoryStub = { salvar: jest.fn().mockResolvedValue(pedidoSalvo) };
      const emailDummy = { enviarEmail: jest.fn().mockResolvedValue() };
      const service = new CheckoutService(gatewayStub, repositoryStub, emailDummy);

      // Act
      const resultado = await service.processarPedido(carrinho, CARTAO);

      // Assert (estado)
      expect(resultado).toBe(pedidoSalvo);
      expect(resultado.totalFinal).toBe(200);
      expect(resultado.status).toBe('PROCESSADO');
    });
  });

  describe('quando um cliente Premium finaliza a compra', () => {
    let gatewayStub, repositoryStub, emailMock, carrinho, pedidoSalvo;

    beforeEach(() => {
      // Arrange
      const premium = UserMother.umUsuarioPremium();
      carrinho = new CarrinhoBuilder()
        .comUser(premium)
        .comItens([new Item('Monitor', 200)])
        .build();
      pedidoSalvo = new Pedido(99, carrinho, 180, 'PROCESSADO');

      gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
      repositoryStub = { salvar: jest.fn().mockResolvedValue(pedidoSalvo) };
      emailMock = { enviarEmail: jest.fn().mockResolvedValue() };
    });

    it('deve cobrar o valor com 10% de desconto e enviar o e-mail de aprovação', async () => {
      const service = new CheckoutService(gatewayStub, repositoryStub, emailMock);

      // Act
      await service.processarPedido(carrinho, CARTAO);

      // Assert (comportamento)
      expect(gatewayStub.cobrar).toHaveBeenCalledWith(180, CARTAO);
      expect(emailMock.enviarEmail).toHaveBeenCalledTimes(1);
      expect(emailMock.enviarEmail).toHaveBeenCalledWith(
        'premium@email.com',
        'Seu Pedido foi Aprovado!',
        expect.stringContaining('99')
      );
    });

    it('não deve falhar o checkout se o envio de e-mail falhar', async () => {
      emailMock.enviarEmail.mockRejectedValue(new Error('SMTP fora do ar'));
      const erroSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const service = new CheckoutService(gatewayStub, repositoryStub, emailMock);

      const resultado = await service.processarPedido(carrinho, CARTAO);

      expect(resultado).toBe(pedidoSalvo);
      erroSpy.mockRestore();
    });
  });
});
