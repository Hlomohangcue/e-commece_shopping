import json
import time
import urllib.request
import urllib.error

API = 'http://localhost:4000'


def request(path, method='GET', body=None, token=None):
    headers = {}
    if body is not None:
        body = json.dumps(body).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    if token:
        headers['Authorization'] = f'Bearer {token}'
    req = urllib.request.Request(API + path, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as err:
        return err.code, json.loads(err.read().decode('utf-8'))


status, health = request('/health')
print('HEALTH', status, health)

status, products = request('/api/products')
print('PRODUCTS_STATUS', status)
print('PRODUCTS', json.dumps(products, indent=2)[:4000])

if not isinstance(products, list) or not products:
    print('No products available for checkout')
    raise SystemExit(0)

product_id = products[0].get('id')
print('USING_PRODUCT_ID', product_id)

email = f"paytest+{int(time.time())}@example.com"
status, register = request(
    '/api/auth/register',
    method='POST',
    body={
        'email': email,
        'password': 'Password123!',
        'name': 'Payment Tester'
    }
)
print('REGISTER', status, json.dumps(register, indent=2))

token = register.get('token') if isinstance(register, dict) else None
if not token:
    print('No token returned from register')
    raise SystemExit(0)

status, cart = request(
    '/api/cart',
    method='POST',
    body={'productId': product_id, 'quantity': 1},
    token=token,
)
print('ADD_CART', status, json.dumps(cart, indent=2))

status, checkout = request(
    '/api/checkout',
    method='POST',
    body={
        'items': [{'productId': product_id, 'quantity': 1}],
        'shippingAddress': {
            'fullName': 'Payment Tester',
            'email': email,
            'phone': '+26655512345',
            'line1': 'Maseru Road',
            'city': 'Maseru',
            'state': 'Maseru',
            'postalCode': '100',
            'country': 'Lesotho',
            'countryCode': 'LS'
        },
        'successUrl': 'http://localhost:3000/checkout/success',
        'cancelUrl': 'http://localhost:3000/checkout/cancel'
    },
    token=token,
)
print('CHECKOUT', status, json.dumps(checkout, indent=2))
