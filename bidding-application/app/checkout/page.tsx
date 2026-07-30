'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getCart, getToken, type CartData } from '@/lib/api';
import { useAuth } from '@/app/contexts/AuthContext';
import ProtectedProductImage from '@/app/components/ProtectedProductImage';

type Success = { razorpay_payment_id:string; razorpay_order_id:string; razorpay_signature:string };
declare global { interface Window { Razorpay:new(options:any)=>{open:()=>void;on:(event:string, callback:(response:any)=>void)=>void} } }
const loadCheckout=()=>new Promise<boolean>((resolve)=>{if(window.Razorpay)return resolve(true);const s=document.createElement('script');s.src='https://checkout.razorpay.com/v1/checkout.js';s.onload=()=>resolve(true);s.onerror=()=>resolve(false);document.body.appendChild(s)});

export default function CheckoutPage(){
  const {user}=useAuth(); const router=useRouter(); const [cart,setCart]=useState<CartData|null>(null);
  const [form,setForm]=useState({name:'',email:user?.email||'',phone:'',address:'',city:'',pinCode:''}); const [message,setMessage]=useState(''); const [paying,setPaying]=useState(false);
  useEffect(()=>{if(user)getCart().then(setCart).catch(console.error)},[user]); useEffect(()=>{if(user?.email)setForm(v=>({...v,email:v.email||user.email}))},[user]);
  const subtotal=cart?.items.reduce((sum,item)=>sum+Number(item.product.priceInRupees)*item.quantity,0)||0; const shipping=subtotal>=10000?0:500;
  const set=(key:keyof typeof form,value:string)=>setForm(v=>({...v,[key]:value}));
  const pay=async()=>{if(!user||!getToken())return router.push('/auth');if(!cart?.items.length)return setMessage('Your bag is empty.');if(Object.values(form).some(v=>!v.trim()))return setMessage('Complete every contact and delivery field.');
    setPaying(true);setMessage('');try{if(!await loadCheckout())throw new Error('Could not load secure payment checkout');
      const response=await fetch('/api/payments/razorpay/order',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${getToken()}`},body:JSON.stringify({deliveryAddress:form})});const order=await response.json();if(!response.ok)throw new Error(order.error||'Could not create order');
      const rz=new window.Razorpay({key:order.keyId,amount:order.amount,currency:order.currency,name:'The Reserve',description:order.productName,order_id:order.razorpayOrderId,prefill:order.customer,theme:{color:'#1c2e25'},modal:{ondismiss:()=>setPaying(false)},handler:async(payment:Success)=>{setMessage('Verifying payment…');const vr=await fetch('/api/payments/razorpay/verify',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${getToken()}`},body:JSON.stringify(payment)});const result=await vr.json();if(!vr.ok){setMessage(result.error||'Verification pending');setPaying(false);return;}setCart({id:cart.id,items:[]});setMessage(`Payment successful. Order ${result.orderId}`);setPaying(false)}});rz.on('payment.failed',(r:any)=>{setMessage(r.error.description||'Payment failed');setPaying(false)});rz.open();
    }catch(error){setMessage(error instanceof Error?error.message:'Payment could not start');setPaying(false)}};
  return <div className="checkout-page"><div className="checkout-main"><Link href="/cart" className="back-link">← Return to bag</Link><p className="eyebrow">Secure checkout</p><h1>Complete your purchase</h1>
    <section className="checkout-section"><div className="checkout-section-title"><span>1</span><h2>Contact</h2></div><div className="form-grid"><input placeholder="Email" value={form.email} onChange={e=>set('email',e.target.value)}/><input placeholder="Phone" value={form.phone} onChange={e=>set('phone',e.target.value)}/></div></section>
    <section className="checkout-section"><div className="checkout-section-title"><span>2</span><h2>Delivery</h2></div><div className="form-grid"><input placeholder="Full name" value={form.name} onChange={e=>set('name',e.target.value)}/><input className="wide" placeholder="Address" value={form.address} onChange={e=>set('address',e.target.value)}/><input placeholder="City" value={form.city} onChange={e=>set('city',e.target.value)}/><input placeholder="PIN code" value={form.pinCode} onChange={e=>set('pinCode',e.target.value)}/></div></section>
    <section className="checkout-section"><div className="checkout-section-title"><span>3</span><h2>Payment</h2></div><p className="payment-note">Your complete bag is processed as one server-verified Razorpay order.</p><button className="pay-button" disabled={paying||!cart?.items.length} onClick={pay}>{paying?'Opening secure payment…':`Pay ₹${(subtotal+shipping).toLocaleString('en-IN')}`}</button>{message&&<p className="integration-message">{message}</p>}</section></div>
    <aside className="order-summary"><p className="eyebrow">Your order</p><h2>{cart?.items.length||0} products</h2><div className="checkout-items">{cart?.items.map(item=><div className="checkout-item" key={item.id}><ProtectedProductImage image={item.product.protectedImages[0]} alt={item.product.title}/><div><strong>{item.product.title}</strong><span>Size {item.size} · Qty {item.quantity}</span></div><b>₹{(Number(item.product.priceInRupees)*item.quantity).toLocaleString('en-IN')}</b></div>)}</div><div className="summary-line"><span>Subtotal</span><strong>₹{subtotal.toLocaleString('en-IN')}</strong></div><div className="summary-line"><span>Delivery</span><strong>{shipping?`₹${shipping}`:'Complimentary'}</strong></div><div className="summary-total"><span>Total</span><strong>₹{(subtotal+shipping).toLocaleString('en-IN')}</strong></div></aside>
  </div>
}
