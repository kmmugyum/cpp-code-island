#include <iostream>
class Robot {
private:
  int energy;
public:
  Robot(int initial) { energy = initial; }
  void charge(int amount) { energy += amount; }
  int getEnergy() { return energy; }
};
int main() {
  Robot a(30);
  Robot b(70);
  a.charge(20);
  std::cout << a.getEnergy() << ' ' << b.getEnergy() << '\n';
}
