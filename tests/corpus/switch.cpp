#include <iostream>
using namespace std;
int main() {
  char key = 'b';
  int result = 0;
  switch (key) {
    case 'a': result = 10; break;
    case 'b': result += 2;
    case 'c': result += 3; break;
    default: result = 99;
  }
  cout << result << '\n';
}
