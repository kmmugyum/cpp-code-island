#include <iostream>
using namespace std;
const int bonus = 4;
int sum(int values[], int n) {
  int result = bonus;
  for (int i = 0; i < n; ++i) result += values[i];
  return result;
}
int main() {
  int data[3] = {1, 2, 3};
  cout << sum(data, 3) << '\n';
}
