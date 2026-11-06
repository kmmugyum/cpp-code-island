#include <iostream>
using namespace std;
int main() {
  int* p = new int[2];
  p[0] = 4;
  p[1] = 7;
  cout << p[0] + p[1] << '\n';
  delete[] p;
}
