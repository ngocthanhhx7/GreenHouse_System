import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import useAuth from '../hooks/useAuth.js';
import { cartService } from '../services/cartService.js';
import { createCartRequestCoordinator } from './cartRequestCoordinator.js';

const EMPTY_CART = {
  id: null,
  version: 0,
  items: [],
  subtotal: 0,
  shippingFee: 0,
  totalAmount: 0,
  canCheckout: false,
};
const CartContext = createContext(null);

export function CartProvider({ children }) {
  const { user } = useAuth();
  const customerId = user?.id || user?._id;
  const customerIdentity = user?.role === 'Customer' ? customerId || user.email || 'customer' : null;
  const [cart, setCart] = useState(EMPTY_CART);
  const cartRef = useRef(EMPTY_CART);
  const coordinatorRef = useRef(null);
  if (!coordinatorRef.current) {
    coordinatorRef.current = createCartRequestCoordinator({
      onCommit(nextCart) {
        cartRef.current = nextCart;
        setCart(nextCart);
      },
    });
  }

  const resetCart = useCallback(() => {
    coordinatorRef.current.reset();
  }, []);

  const runCartMutation = useCallback(async (operation) => {
    const result = await coordinatorRef.current.run(() => operation(cartRef.current));
    return result.data;
  }, []);

  const refreshCart = useCallback(async () => {
    if (user?.role !== 'Customer') {
      return EMPTY_CART;
    }

    const result = await coordinatorRef.current.run(() => cartService.getCart());
    return result.data;
  }, [customerIdentity, user?.role]);

  useEffect(() => {
    coordinatorRef.current.switchIdentity(customerIdentity);
    if (!customerIdentity) return undefined;

    refreshCart().catch(() => {});
    return undefined;
  }, [customerIdentity, refreshCart]);

  const itemCount = cart.items.reduce((total, item) => total + Math.max(0, Number(item.quantity) || 0), 0);
  const value = useMemo(() => ({
    cart,
    itemCount,
    hasItems: itemCount > 0,
    refreshCart,
    resetCart,
    runCartMutation,
  }), [cart, itemCount, refreshCart, resetCart, runCartMutation]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error('useCart must be used inside CartProvider');
  return value;
}
