#include <iostream>
using namespace std;
int main() {
  int sum = 0;
  for (int i = 0; i < 5; i++) {
    if (i == 2) continue;
    sum += i;
  }
  int n = 2;
  do { sum += n; n--; } while (n > 0);
  while (n < 2) { n++; if (n == 1) break; }
  cout << sum << " " << n << "\n";
}
