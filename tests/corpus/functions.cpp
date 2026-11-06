#include <iostream>
using namespace std;
int factorial(int n);
void add(int& x, int y) { x += y; }
int main() {
  int x = 3;
  add(x, factorial(3));
  cout << x << '\n';
}
int factorial(int n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}
