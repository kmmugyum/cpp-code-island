#include <iostream>
using namespace std;
int main() {
  int values[3] = {4, 5, 6};
  int* p = values;
  *(p + 1) = 9;
  p++;
  cout << *p << ' ' << values[1] << '\n';
}
