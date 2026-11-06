#include <iostream>
using namespace std;
int main() {
  int grid[2][3] = {{1, 2}, {4}};
  grid[1][2] = 7;
  int sum = 0;
  for (int i = 0; i < 3; ++i) sum += grid[1][i];
  char text[4] = "Ab";
  int a = text[1], b = text[2];
  cout << sum << ' ' << a << ' ' << b << '\n';
}
